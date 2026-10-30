import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';
import { newEpisodeTexts } from './notification-texts.js';
import { PushService } from './push.service.js';

/** Une notification « nouvel épisode » par série et par heure (UTC) au maximum. */
export function newEpisodeGroupKey(seriesId: string, now = new Date()): string {
  return `push:new_episode:${seriesId}:${now.toISOString().slice(0, 13).replace(/[-T]/g, '')}`;
}
export const NEW_EPISODE_GROUP_TTL_SECONDS = 3600;

export interface NewEpisodeOutcome {
  notified: number;
  skipped?: 'not_visible' | 'grouped' | 'no_followers';
}

/**
 * Déclencheur M-54 : quand un épisode devient READY et visible (transcodage terminé ou date de
 * publication atteinte), les utilisateurs qui suivent la série (favoris) et n'ont pas désactivé
 * `newEpisodes` reçoivent une notification in-app et un push (plafond quotidien de `PushService`).
 */
@Injectable()
export class NewEpisodeNotifier {
  private readonly logger = new Logger(NewEpisodeNotifier.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly push: PushService,
  ) {}

  /** Variante « sans attendre » pour les chemins critiques (fin de transcodage). */
  onEpisodeVisible(episodeId: string): void {
    void this.notifyEpisode(episodeId).catch((err: Error) =>
      this.logger.error(`New-episode push failed for ${episodeId}: ${err.message}`),
    );
  }

  async notifyEpisode(episodeId: string, now = new Date()): Promise<NewEpisodeOutcome> {
    const episode = await this.prisma.episode.findFirst({
      where: {
        id: episodeId,
        transcodeStatus: 'READY',
        publishedAt: { lte: now },
        series: { status: 'PUBLISHED', publishedAt: { lte: now } },
      },
      select: { id: true, number: true, seriesId: true, series: { select: { title: true } } },
    });
    if (!episode) return { notified: 0, skipped: 'not_visible' };
    if (!(await this.claimGroup(episode.seriesId, now))) {
      return { notified: 0, skipped: 'grouped' };
    }

    const followers = await this.prisma.favorite.findMany({
      where: { seriesId: episode.seriesId, user: { status: 'ACTIVE' } },
      select: {
        user: { select: { id: true, language: true, notificationPreferences: true } },
      },
    });
    const targets = followers
      .map((f) => f.user)
      .filter((u) => prefersNewEpisodes(u.notificationPreferences));
    if (targets.length === 0) return { notified: 0, skipped: 'no_followers' };

    let notified = 0;
    for (const user of targets) {
      const texts = newEpisodeTexts(user.language, episode.series.title, episode.number);
      try {
        await this.push.notify(
          {
            userId: user.id,
            type: 'new_episode',
            ...texts,
            data: { seriesId: episode.seriesId, episodeId: episode.id },
          },
          now,
        );
        notified += 1;
      } catch (err) {
        this.logger.warn(`Notify ${user.id} failed: ${(err as Error).message}`);
      }
    }
    this.logger.log(
      `New episode ${episode.number} of ${episode.series.title}: ${notified} follower(s) notified`,
    );
    return { notified };
  }

  /** Verrou d'une heure par série ; sans Redis, on notifie (pas de regroupement possible). */
  private async claimGroup(seriesId: string, now: Date): Promise<boolean> {
    try {
      const ok = await this.redis.client.set(
        newEpisodeGroupKey(seriesId, now),
        '1',
        'EX',
        NEW_EPISODE_GROUP_TTL_SECONDS,
        'NX',
      );
      return ok === 'OK';
    } catch {
      return true;
    }
  }
}

export function prefersNewEpisodes(preferences: unknown): boolean {
  const prefs = (preferences ?? {}) as Record<string, unknown>;
  return prefs.newEpisodes !== false;
}
