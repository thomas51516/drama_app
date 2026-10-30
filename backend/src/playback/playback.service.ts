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
  type ViewerContext,
  visibleEpisodeWhere,
} from '../catalog/catalog.where.js';
import { computeAccess, EntitlementService } from '../catalog/entitlement.service.js';
import { AppConfig } from '../config/app-config.js';
import { MEDIA_URL_SIGNER, type MediaUrlSigner } from '../media/media-url-signer.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UnlockService } from '../unlock/unlock.service.js';
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
    private readonly unlocks: UnlockService,
    private readonly config: AppConfig,
    @Inject(MEDIA_URL_SIGNER) private readonly signer: MediaUrlSigner,
  ) {}

  /**
   * Vérifie le droit d'accès puis renvoie la session de lecture avec l'URL de manifeste signée
   * (S04-BE-02). Territoire appliqué comme le catalogue (DEF-004). Épisode verrouillé : déblocage
   * automatique dans la même requête si `user.autoUnlock` et solde suffisant (S07-BE-03,
   * `unlocked: true`), sinon 403 `EPISODE_LOCKED { coinCost, balance, canAutoUnlock }`.
   * Abonné VIP : toujours autorisé, déblocage `vip` enregistré sans débit.
   */
  async play(userId: string, episodeId: string, viewer: ViewerContext): Promise<PlaySessionDto> {
    const episode = await this.prisma.episode.findFirst({
      where: { id: episodeId, ...visibleEpisodeWhere(), series: publishedSeriesWhere(viewer) },
      include: { series: true, subtitles: subtitleSelect },
    });
    if (!episode) {
      throw new NotFoundException({ code: 'EPISODE_NOT_FOUND', message: 'Episode not found' });
    }

    const entitlements = await this.entitlements.forViewer(userId, [episode.id]);
    let access = computeAccess(episode, episode.series, entitlements);
    let unlocked = false;
    if (access === 'unlocked' && entitlements.isVip && !entitlements.unlocked.has(episode.id)) {
      await this.unlocks.unlock(userId, episode, episode.series);
    }
    if (access === 'locked') {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { autoUnlock: true },
      });
      const cost = episode.series.coinCostPerEpisode;
      if (user?.autoUnlock) {
        const outcome = await this.unlocks.unlock(userId, episode, episode.series);
        if (outcome.kind === 'unlocked') {
          access = 'unlocked';
          unlocked = outcome.created;
        } else {
          throw this.locked(episode, cost, outcome.balance, false);
        }
      } else {
        const quote = await this.unlocks.quote(userId, cost);
        throw this.locked(episode, cost, quote.balance, quote.affordable);
      }
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
      unlocked,
      manifestUrl: signed.url,
      expiresAt: signed.expiresAt,
      drm: { type: 'none' },
      subtitles: episode.subtitles.map((s) => toSubtitleTrack(s, this.config.cdnBaseUrl)),
      resumePositionSeconds: progress && !progress.completed ? progress.positionSeconds : 0,
      durationSeconds: episode.durationSeconds,
      nextEpisodeId: next?.id ?? null,
    };
  }

  private locked(
    episode: { id: string; seriesId: string; series: { freeEpisodeCount: number } },
    coinCost: number,
    balance: number,
    canAutoUnlock: boolean,
  ): ForbiddenException {
    return new ForbiddenException({
      code: 'EPISODE_LOCKED',
      message: 'This episode must be unlocked first',
      details: {
        episodeId: episode.id,
        seriesId: episode.seriesId,
        coinCost,
        balance,
        canAutoUnlock,
        freeEpisodeCount: episode.series.freeEpisodeCount,
      },
    });
  }

  /**
   * Reprise à la seconde près, sur tout appareil du compte (M-15). Le serveur fait foi (DEF-003) :
   * un épisode invisible répond 404, un épisode verrouillé 403 `EPISODE_LOCKED`.
   */
  async saveProgress(
    userId: string,
    dto: UpdateProgressDto,
    viewer: ViewerContext,
  ): Promise<WatchProgressDto> {
    const episode = await this.prisma.episode.findFirst({
      where: { id: dto.episodeId, ...visibleEpisodeWhere(), series: publishedSeriesWhere(viewer) },
      select: {
        id: true,
        number: true,
        durationSeconds: true,
        series: { select: { freeEpisodeCount: true } },
      },
    });
    if (!episode) {
      throw new NotFoundException({ code: 'EPISODE_NOT_FOUND', message: 'Episode not found' });
    }
    const entitlements = await this.entitlements.forViewer(userId, [episode.id]);
    if (computeAccess(episode, episode.series, entitlements) === 'locked') {
      throw new ForbiddenException({
        code: 'EPISODE_LOCKED',
        message: 'This episode must be unlocked first',
        details: { episodeId: episode.id },
      });
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
