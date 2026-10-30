import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { resolveMediaUrl, toSubtitleTrack } from '../catalog/catalog.mapper.js';
import {
  publishedSeriesWhere,
  subtitleSelect,
  visibleEpisodeWhere,
} from '../catalog/catalog.where.js';
import { computeAccess, EntitlementService } from '../catalog/entitlement.service.js';
import { AppConfig } from '../config/app-config.js';
import { MEDIA_URL_SIGNER, type MediaUrlSigner } from '../media/media-url-signer.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  type PlaySessionDto,
  type UpdateProgressDto,
  type WatchProgressDto,
} from './dto/playback.dto.js';

@Injectable()
export class PlaybackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementService,
    private readonly config: AppConfig,
    @Inject(MEDIA_URL_SIGNER) private readonly signer: MediaUrlSigner,
  ) {}

  /**
   * Vérifie le droit d'accès puis renvoie la session de lecture avec l'URL de manifeste signée
   * (S04-BE-02). 403 EPISODE_LOCKED si l'épisode n'est ni gratuit, ni débloqué, ni couvert par le VIP.
   */
  async play(userId: string, episodeId: string): Promise<PlaySessionDto> {
    const episode = await this.prisma.episode.findFirst({
      where: { id: episodeId, ...visibleEpisodeWhere(), series: publishedSeriesWhere({}) },
      include: { series: true, subtitles: subtitleSelect },
    });
    if (!episode) {
      throw new NotFoundException({ code: 'EPISODE_NOT_FOUND', message: 'Episode not found' });
    }

    const entitlements = await this.entitlements.forViewer(userId, [episode.id]);
    const access = computeAccess(episode, episode.series, entitlements);
    if (access === 'locked') {
      throw new ForbiddenException({
        code: 'EPISODE_LOCKED',
        message: 'This episode must be unlocked first',
        details: {
          episodeId: episode.id,
          seriesId: episode.seriesId,
          coinCost: episode.series.coinCostPerEpisode,
          freeEpisodeCount: episode.series.freeEpisodeCount,
        },
      });
    }

    // TODO S10-BE-05 : DRM Widevine sur les épisodes payants.
    const manifestUrl = resolveMediaUrl(episode.hlsKey, this.config.cdnBaseUrl);
    if (!manifestUrl) {
      throw new ConflictException({
        code: 'EPISODE_NOT_READY',
        message: 'Episode has no manifest yet',
      });
    }
    const signed = this.signer.sign(manifestUrl);

    const [progress, next] = await Promise.all([
      this.prisma.watchProgress.findUnique({
        where: { userId_episodeId: { userId, episodeId: episode.id } },
        select: { positionSeconds: true, completed: true },
      }),
      this.prisma.episode.findFirst({
        where: { seriesId: episode.seriesId, number: episode.number + 1, ...visibleEpisodeWhere() },
        select: { id: true },
      }),
    ]);

    return {
      episodeId: episode.id,
      seriesId: episode.seriesId,
      episodeNumber: episode.number,
      access,
      manifestUrl: signed.url,
      expiresAt: signed.expiresAt,
      drm: { type: 'none' },
      subtitles: episode.subtitles.map((s) => toSubtitleTrack(s, this.config.cdnBaseUrl)),
      resumePositionSeconds: progress && !progress.completed ? progress.positionSeconds : 0,
      durationSeconds: episode.durationSeconds,
      nextEpisodeId: next?.id ?? null,
    };
  }

  /** Reprise à la seconde près, sur tout appareil du compte (M-15). */
  async saveProgress(userId: string, dto: UpdateProgressDto): Promise<WatchProgressDto> {
    const episode = await this.prisma.episode.findUnique({
      where: { id: dto.episodeId },
      select: { id: true, durationSeconds: true },
    });
    if (!episode) {
      throw new NotFoundException({ code: 'EPISODE_NOT_FOUND', message: 'Episode not found' });
    }

    const completed =
      dto.completed ??
      (episode.durationSeconds > 0 && dto.positionSeconds >= episode.durationSeconds - 2);

    const saved = await this.prisma.watchProgress.upsert({
      where: { userId_episodeId: { userId, episodeId: dto.episodeId } },
      create: { userId, episodeId: dto.episodeId, positionSeconds: dto.positionSeconds, completed },
      update: { positionSeconds: dto.positionSeconds, completed },
    });

    return {
      episodeId: saved.episodeId,
      positionSeconds: saved.positionSeconds,
      completed: saved.completed,
      updatedAt: saved.updatedAt.toISOString(),
    };
  }
}
