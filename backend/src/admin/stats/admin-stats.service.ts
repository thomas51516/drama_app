import { Injectable, NotFoundException } from '@nestjs/common';
import { CatalogCacheService } from '../../cache/catalog-cache.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  type RetentionStatsDto,
  type RevenueBySourceDto,
  type StatsOverviewDto,
  type TopSeriesStatDto,
} from './dto/admin-stats.dto.js';

export const STATS_CACHE_TTL_SECONDS = 300;
export const TOP_SERIES_LIMIT = 10;
/** Fenêtre d'attribution de la conversion au paywall (B-11) : voir la note de méthodologie dans le DTO. */
export const PAYWALL_CONVERSION_WINDOW_HOURS = 24;
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
interface EventsRow {
  paywall_views: number;
  push_opens: number;
}
interface TopRow {
  series_id: string;
  title: string;
  viewers: number;
  completions: number;
}
interface UnlocksRow {
  unlocks: number;
}
interface RevenueRow {
  provider: 'GOOGLE_PLAY' | 'MOBILE_MONEY';
  currency: string;
  amount_minor: number;
  order_count: number;
}
interface ConversionRow {
  viewers_count: number;
  converted_count: number;
}
interface RetentionRow {
  number: number;
  viewers: number;
}

/**
 * Tableau de bord v0 (B-11) : agrégats SQL sur `users`, `watch_progress` et `analytics_events`
 * (S06-BE-03), mis en cache 5 min.
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

    const [active, counts, progress, top, events, unlocksRow, revenue, conversion] =
      await Promise.all([
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
        this.prisma.$queryRaw<EventsRow[]>`
        SELECT COUNT(*) FILTER (WHERE name = 'paywall_view')::int AS paywall_views,
               COUNT(*) FILTER (WHERE name = 'push_open')::int    AS push_opens
        FROM analytics_events
        WHERE name IN ('paywall_view', 'push_open') AND occurred_at >= ${since}`,
        this.prisma.$queryRaw<UnlocksRow[]>`
        SELECT COUNT(*)::int AS unlocks FROM unlocks WHERE created_at >= ${since}`,
        // Revenus réels (B-11) : coin_ledger (type PURCHASE) joint à purchases, jamais la projection
        // wallets. Les codes promo créditent en BONUS avec reference_type = 'promo_code' donc n'entrent
        // jamais dans cette somme.
        this.prisma.$queryRaw<RevenueRow[]>`
        SELECT p.provider, p.currency,
               SUM(p.amount_minor)::int AS amount_minor,
               COUNT(*)::int AS order_count
        FROM coin_ledger cl
        JOIN purchases p ON p.id::text = cl.reference_id
        WHERE cl.type = 'PURCHASE' AND cl.reference_type = 'purchase'
          AND cl.created_at >= ${since}
          AND p.amount_minor IS NOT NULL AND p.currency IS NOT NULL
        GROUP BY p.provider, p.currency
        ORDER BY p.provider, p.currency`,
        // Conversion au paywall (B-11, approximation documentée dans PaywallConversionDto) : un
        // déblocage dans les PAYWALL_CONVERSION_WINDOW_HOURS heures qui suivent une vue compte comme
        // une conversion, faute de session partagée entre analytics_events et unlocks.
        this.prisma.$queryRaw<ConversionRow[]>`
        WITH views AS (
          SELECT user_id, occurred_at
          FROM analytics_events
          WHERE name = 'paywall_view' AND occurred_at >= ${since} AND user_id IS NOT NULL
        ),
        converted AS (
          SELECT DISTINCT v.user_id
          FROM views v
          JOIN unlocks u ON u.user_id = v.user_id
            AND u.created_at >= v.occurred_at
            AND u.created_at <= v.occurred_at + (${PAYWALL_CONVERSION_WINDOW_HOURS}::text || ' hours')::interval
        )
        SELECT (SELECT COUNT(DISTINCT user_id) FROM views)::int AS viewers_count,
               (SELECT COUNT(*) FROM converted)::int AS converted_count`,
      ]);

    const a = active[0] ?? { d1: 0, d7: 0, d30: 0 };
    const c = counts[0] ?? { new_users: 0, registered_users: 0, guest_users: 0 };
    const p = progress[0] ?? { started: 0, completed: 0 };
    const ev = events[0] ?? { paywall_views: 0, push_opens: 0 };
    const u = unlocksRow[0] ?? { unlocks: 0 };
    const conv = conversion[0] ?? { viewers_count: 0, converted_count: 0 };
    const topSeries: TopSeriesStatDto[] = top.map((t) => ({
      seriesId: t.series_id,
      title: t.title,
      viewers: t.viewers,
      completions: t.completions,
    }));
    const revenueBySource: RevenueBySourceDto[] = revenue.map((r) => ({
      source: r.provider,
      currency: r.currency,
      amountMinor: r.amount_minor,
      orderCount: r.order_count,
    }));
    return {
      activeUsers: { d1: a.d1, d7: a.d7, d30: a.d30 },
      newUsers: c.new_users,
      registeredUsers: c.registered_users,
      guestUsers: c.guest_users,
      episodesStarted: p.started,
      episodesCompleted: p.completed,
      topSeries,
      paywallViews: ev.paywall_views,
      unlocks: u.unlocks,
      pushOpens: ev.push_opens,
      revenueBySource,
      paywallConversion: {
        paywallViewers: conv.viewers_count,
        convertedViewers: conv.converted_count,
        conversionRate: conv.viewers_count > 0 ? conv.converted_count / conv.viewers_count : 0,
        windowHours: PAYWALL_CONVERSION_WINDOW_HOURS,
      },
      days,
      generatedAt: now.toISOString(),
    };
  }

  /**
   * Rétention par épisode (B-11) : pourcentage de la cohorte « épisode 1 » encore présente à
   * l'épisode N, calculé depuis `watch_progress` (démarré = une ligne existe, peu importe
   * `completed`). Sans `seriesId` : cohortes combinées de toutes les séries (un utilisateur qui a
   * démarré l'épisode 1 de deux séries compte deux fois, une par série) — voir `RetentionStatsDto`.
   */
  async retention(seriesId: string | undefined, now = new Date()): Promise<RetentionStatsDto> {
    if (seriesId) {
      const series = await this.prisma.series.findUnique({
        where: { id: seriesId },
        select: { id: true },
      });
      if (!series) {
        throw new NotFoundException({ code: 'SERIES_NOT_FOUND', message: 'Series not found' });
      }
    }
    const rows = await this.prisma.$queryRaw<RetentionRow[]>`
      WITH base AS (
        SELECT wp.user_id, e.series_id, e.number
        FROM watch_progress wp
        JOIN episodes e ON e.id = wp.episode_id
        WHERE ${seriesId ?? null}::uuid IS NULL OR e.series_id = ${seriesId ?? null}::uuid
      ),
      ep1 AS (
        SELECT DISTINCT user_id, series_id FROM base WHERE number = 1
      )
      SELECT b.number,
             COUNT(DISTINCT (b.user_id, b.series_id))::int AS viewers
      FROM base b
      JOIN ep1 ON ep1.user_id = b.user_id AND ep1.series_id = b.series_id
      GROUP BY b.number
      ORDER BY b.number`;
    const cohortSize = rows.find((r) => r.number === 1)?.viewers ?? 0;
    const points = rows.map((r) => ({
      episodeNumber: r.number,
      viewers: r.viewers,
      retentionPercent: cohortSize > 0 ? (r.viewers / cohortSize) * 100 : 0,
    }));
    return { seriesId: seriesId ?? null, cohortSize, points, generatedAt: now.toISOString() };
  }
}
