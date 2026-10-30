import { Injectable } from '@nestjs/common';
import { CatalogCacheService } from '../../cache/catalog-cache.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { type StatsOverviewDto, type TopSeriesStatDto } from './dto/admin-stats.dto.js';

export const STATS_CACHE_TTL_SECONDS = 300;
export const TOP_SERIES_LIMIT = 10;
export const statsCacheKey = (days: number): string => `cache:v1:admin:stats:overview:${days}`;

interface ActiveRow {
  d1: number;
  d7: number;
  d30: number;
}
interface CountRow {
  new_users: number;
  registered_users: number;
  guest_users: number;
}
interface ProgressRow {
  started: number;
  completed: number;
}
interface TopRow {
  series_id: string;
  title: string;
  viewers: number;
  completions: number;
}

/**
 * Tableau de bord v0 (B-11) : agrégats SQL sur `users` et `watch_progress`, mis en cache 5 min.
 * Un utilisateur est « actif » s'il a renouvelé sa session ou fait progresser une lecture dans la fenêtre.
 */
@Injectable()
export class AdminStatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CatalogCacheService,
  ) {}

  overview(days: number, now = new Date()): Promise<StatsOverviewDto> {
    return this.cache.remember(statsCacheKey(days), STATS_CACHE_TTL_SECONDS, () =>
      this.compute(days, now),
    );
  }

  async compute(days: number, now = new Date()): Promise<StatsOverviewDto> {
    const since = new Date(now.getTime() - days * 86_400_000);
    const d1 = new Date(now.getTime() - 86_400_000);
    const d7 = new Date(now.getTime() - 7 * 86_400_000);
    const d30 = new Date(now.getTime() - 30 * 86_400_000);

    const [active, counts, progress, top] = await Promise.all([
      this.prisma.$queryRaw<ActiveRow[]>`
        WITH activity AS (
          SELECT u.id,
                 GREATEST(u.last_seen_at,
                          (SELECT MAX(wp.updated_at) FROM watch_progress wp WHERE wp.user_id = u.id)) AS last_active
          FROM users u
          WHERE u.status IN ('ACTIVE', 'DELETION_PENDING')
        )
        SELECT COUNT(*) FILTER (WHERE last_active >= ${d1})::int  AS d1,
               COUNT(*) FILTER (WHERE last_active >= ${d7})::int  AS d7,
               COUNT(*) FILTER (WHERE last_active >= ${d30})::int AS d30
        FROM activity`,
      this.prisma.$queryRaw<CountRow[]>`
        SELECT COUNT(*) FILTER (WHERE created_at >= ${since} AND status <> 'MERGED')::int AS new_users,
               COUNT(*) FILTER (WHERE type = 'REGISTERED' AND status IN ('ACTIVE', 'DELETION_PENDING'))::int AS registered_users,
               COUNT(*) FILTER (WHERE type = 'GUEST' AND status = 'ACTIVE')::int AS guest_users
        FROM users`,
      this.prisma.$queryRaw<ProgressRow[]>`
        SELECT COUNT(*)::int AS started,
               COUNT(*) FILTER (WHERE completed)::int AS completed
        FROM watch_progress WHERE updated_at >= ${since}`,
      this.prisma.$queryRaw<TopRow[]>`
        SELECT e.series_id, s.title,
               COUNT(DISTINCT wp.user_id)::int AS viewers,
               COUNT(*) FILTER (WHERE wp.completed)::int AS completions
        FROM watch_progress wp
        JOIN episodes e ON e.id = wp.episode_id
        JOIN series s ON s.id = e.series_id
        WHERE wp.updated_at >= ${since}
        GROUP BY e.series_id, s.title
        ORDER BY viewers DESC, completions DESC, s.title ASC
        LIMIT ${TOP_SERIES_LIMIT}`,
    ]);

    const a = active[0] ?? { d1: 0, d7: 0, d30: 0 };
    const c = counts[0] ?? { new_users: 0, registered_users: 0, guest_users: 0 };
    const p = progress[0] ?? { started: 0, completed: 0 };
    const topSeries: TopSeriesStatDto[] = top.map((t) => ({
      seriesId: t.series_id,
      title: t.title,
      viewers: t.viewers,
      completions: t.completions,
    }));
    return {
      activeUsers: { d1: a.d1, d7: a.d7, d30: a.d30 },
      newUsers: c.new_users,
      registeredUsers: c.registered_users,
      guestUsers: c.guest_users,
      episodesStarted: p.started,
      episodesCompleted: p.completed,
      topSeries,
      days,
      generatedAt: now.toISOString(),
    };
  }
}
