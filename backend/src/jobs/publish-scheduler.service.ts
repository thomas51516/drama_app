import { Injectable, Logger } from '@nestjs/common';
import { CatalogCacheService } from '../cache/catalog-cache.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { NewEpisodeNotifier } from '../push/new-episode-notifier.service.js';
import { RedisService } from '../redis/redis.service.js';

export const PUBLISH_LAST_RUN_KEY = 'schedule:publish:last_run';
/** Fenêtre rattrapée au premier passage (ou après une longue interruption). */
export const PUBLISH_CATCH_UP_MS = 10 * 60_000;

export interface PublishFlip {
  seriesIds: string[];
  episodeIds: string[];
}

/**
 * Publication programmée (B-04) : chaque minute, repère les séries et épisodes dont `publishedAt`
 * vient d'être atteint depuis le dernier passage, invalide le cache du catalogue pour qu'ils
 * apparaissent immédiatement, journalise ce qui devient visible et déclenche les notifications
 * « nouvel épisode d'une série suivie » (M-54).
 */
@Injectable()
export class PublishSchedulerService {
  private readonly logger = new Logger(PublishSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly cache: CatalogCacheService,
    private readonly notifier: NewEpisodeNotifier,
  ) {}

  async runOnce(now = new Date()): Promise<PublishFlip> {
    const since = await this.lastRun(now);
    const flip = await this.findBecameVisible(since, now);
    await this.applyFlip(flip);
    await this.saveLastRun(now);
    for (const episodeId of flip.episodeIds) {
      try {
        await this.notifier.notifyEpisode(episodeId, now);
      } catch (err) {
        this.logger.warn(`New-episode push failed for ${episodeId}: ${(err as Error).message}`);
      }
    }
    return flip;
  }

  /** Séries publiées et épisodes prêts dont la date de publication est dans ]since, now]. */
  async findBecameVisible(since: Date, now: Date): Promise<PublishFlip> {
    const [series, episodes] = await Promise.all([
      this.prisma.series.findMany({
        where: { status: 'PUBLISHED', publishedAt: { gt: since, lte: now } },
        select: { id: true },
      }),
      this.prisma.episode.findMany({
        where: {
          transcodeStatus: 'READY',
          publishedAt: { gt: since, lte: now },
          series: { status: 'PUBLISHED' },
        },
        select: { id: true, seriesId: true },
      }),
    ]);
    const seriesIds = new Set(series.map((s) => s.id));
    for (const e of episodes) seriesIds.add(e.seriesId);
    return { seriesIds: [...seriesIds], episodeIds: episodes.map((e) => e.id) };
  }

  private async applyFlip(flip: PublishFlip): Promise<void> {
    if (flip.seriesIds.length === 0) return;
    for (const id of flip.seriesIds) await this.cache.invalidateSeries(id, false);
    await this.cache.invalidateHome();
    this.logger.log(
      `Scheduled publication reached: ${flip.seriesIds.length} series, ${flip.episodeIds.length} episode(s) now visible`,
    );
  }

  private async lastRun(now: Date): Promise<Date> {
    const fallback = new Date(now.getTime() - PUBLISH_CATCH_UP_MS);
    try {
      const raw = await this.redis.client.get(PUBLISH_LAST_RUN_KEY);
      const ts = raw ? Number(raw) : NaN;
      return Number.isFinite(ts) && ts < now.getTime() ? new Date(ts) : fallback;
    } catch {
      return fallback;
    }
  }

  private async saveLastRun(now: Date): Promise<void> {
    try {
      await this.redis.client.set(PUBLISH_LAST_RUN_KEY, String(now.getTime()));
    } catch (err) {
      this.logger.warn(`Cannot persist last run: ${(err as Error).message}`);
    }
  }
}
