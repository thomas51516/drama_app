import { Inject, Injectable, Logger } from '@nestjs/common';
import { AuditService } from '../admin/audit/audit.service.js';
import { CatalogCacheService } from '../cache/catalog-cache.service.js';
import { type Episode } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { NewEpisodeNotifier } from '../push/new-episode-notifier.service.js';
import { TranscodeMetrics } from './transcode.metrics.js';
import {
  TRANSCODE_PROVIDER,
  type TranscodeProvider,
  type TranscodeResult,
} from './transcode.types.js';

export interface EpisodeLookup {
  episodeId?: string;
  externalId?: string;
  sourceKey?: string;
}

/**
 * Façade du transcodage : soumission au fournisseur configuré et transitions de statut
 * (UPLOADED → PROCESSING → READY | FAILED), communes au worker local et au webhook.
 */
@Injectable()
export class TranscodeService {
  private readonly logger = new Logger(TranscodeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly metrics: TranscodeMetrics,
    @Inject(TRANSCODE_PROVIDER) private readonly provider: TranscodeProvider,
    private readonly cache: CatalogCacheService,
    private readonly notifier: NewEpisodeNotifier,
  ) {}

  get providerName(): TranscodeProvider['name'] {
    return this.provider.name;
  }

  /** Met l'épisode en file chez le fournisseur ; l'épisode doit avoir une `sourceKey`. */
  async submit(episode: Episode): Promise<Episode> {
    const submission = await this.provider.submit(episode);
    return this.prisma.episode.update({
      where: { id: episode.id },
      data: {
        transcodeStatus: submission.status,
        transcodeError: null,
        transcodeExternalId: submission.externalId ?? null,
      },
    });
  }

  async markProcessing(episodeId: string): Promise<void> {
    await this.prisma.episode.update({
      where: { id: episodeId },
      data: { transcodeStatus: 'PROCESSING', transcodeError: null },
    });
  }

  async markReady(episode: Episode, result: TranscodeResult, source: string): Promise<Episode> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.episode.update({
        where: { id: episode.id },
        data: {
          transcodeStatus: 'READY',
          transcodeError: null,
          hlsKey: result.hlsKey,
          previewKey: result.previewKey ?? episode.previewKey,
          thumbnailUrl: result.thumbnailUrl ?? episode.thumbnailUrl,
          durationSeconds: result.durationSeconds ?? episode.durationSeconds,
          // DEF-001 : un épisode prêt devient visible immédiatement, sauf si l'éditeur a déjà
          // programmé une date (B-04). Sans cela il restait invisible dans l'app.
          ...(episode.publishedAt === null ? { publishedAt: new Date() } : {}),
        },
      });
      await this.audit.record(
        {
          actor: null,
          action: 'episode.transcoded',
          targetType: 'episode',
          targetId: episode.id,
          oldValue: { transcodeStatus: episode.transcodeStatus, hlsKey: episode.hlsKey },
          newValue: {
            transcodeStatus: 'READY',
            hlsKey: saved.hlsKey,
            durationSeconds: saved.durationSeconds,
            source,
          },
        },
        tx,
      );
      return saved;
    });
    this.metrics.jobsTotal.inc({ status: 'ready', provider: source });
    this.logger.log(`Episode ${episode.id} READY (${source})`);
    // Un épisode devient visible : fiche série, grille et accueil (nombre d'épisodes) sont périmés.
    await this.cache.invalidateSeries(episode.seriesId);
    // Nouvel épisode d'une série suivie (M-54) : ne notifie que s'il est déjà visible.
    this.notifier.onEpisodeVisible(episode.id);
    return updated;
  }

  async markFailed(episode: Episode, error: string, source: string): Promise<Episode> {
    const message = error.slice(0, 4000);
    const updated = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.episode.update({
        where: { id: episode.id },
        data: { transcodeStatus: 'FAILED', transcodeError: message },
      });
      await this.audit.record(
        {
          actor: null,
          action: 'episode.transcode_failed',
          targetType: 'episode',
          targetId: episode.id,
          oldValue: { transcodeStatus: episode.transcodeStatus },
          newValue: { transcodeStatus: 'FAILED', error: message.slice(0, 500), source },
        },
        tx,
      );
      return saved;
    });
    this.metrics.jobsTotal.inc({ status: 'failed', provider: source });
    this.logger.warn(`Episode ${episode.id} FAILED (${source}): ${message.slice(0, 200)}`);
    return updated;
  }

  /** Retrouve l'épisode visé par un webhook : par id, identifiant externe ou clé source. */
  async findForWebhook(lookup: EpisodeLookup): Promise<Episode | null> {
    if (lookup.episodeId) {
      return this.prisma.episode.findUnique({ where: { id: lookup.episodeId } });
    }
    if (lookup.externalId) {
      return this.prisma.episode.findFirst({ where: { transcodeExternalId: lookup.externalId } });
    }
    if (lookup.sourceKey) {
      return this.prisma.episode.findFirst({ where: { sourceKey: lookup.sourceKey } });
    }
    return null;
  }
}
