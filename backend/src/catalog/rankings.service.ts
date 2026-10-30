import { Injectable } from '@nestjs/common';
import { CatalogCacheService } from '../cache/catalog-cache.service.js';
import { canonicalGenre } from '../common/i18n/genre-label.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { toSeriesSummary } from './catalog.mapper.js';
import { publishedSeriesWhere, seriesInclude, type ViewerContext } from './catalog.where.js';
import { PersonalizationService } from './personalization.service.js';
import { type RankingPeriod, type RankingsDto } from './dto/catalog.dto.js';

export const RANKINGS_CACHE_TTL_SECONDS = 600;
export const RANKINGS_SIZE = 20;

const PERIOD_DAYS: Record<RankingPeriod, number | null> = { day: 1, week: 7, all: null };

/**
 * Classements (M-04, contrat v1.5) : séries classées par spectateurs distincts dont `watch_progress`
 * a bougé sur la période (jour, semaine, toujours), publiées et autorisées sur le territoire ;
 * filtre de genre optionnel ; cache 10 min par (période, genre, pays), personnalisation après cache.
 */
@Injectable()
export class RankingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CatalogCacheService,
    private readonly personalization: PersonalizationService,
  ) {}

  async rankings(
    period: RankingPeriod,
    genre: string | undefined,
    viewer: ViewerContext,
    now = new Date(),
  ): Promise<RankingsDto> {
    const genreKey = genre ? canonicalGenre(genre) : null;
    const key = `cache:v1:rankings:${period}:${genreKey ?? '*'}:${viewer.country ?? '*'}`;
    const cached = await this.cache.remember(key, RANKINGS_CACHE_TTL_SECONDS, () =>
      this.compute(period, genreKey, viewer, now),
    );
    const series = await this.personalization.decorate(
      viewer.userId,
      cached.items.map((i) => i.series),
    );
    return { period, items: cached.items.map((i, n) => ({ ...i, series: series[n] })) };
  }

  private async compute(
    period: RankingPeriod,
    genre: string | null,
    viewer: ViewerContext,
    now: Date,
  ): Promise<RankingsDto> {
    const days = PERIOD_DAYS[period];
    const since = days === null ? new Date(0) : new Date(now.getTime() - days * 86_400_000);
    const ranking = await this.prisma.$queryRaw<{ series_id: string; viewers: number }[]>`
      SELECT e.series_id, COUNT(DISTINCT wp.user_id)::int AS viewers
      FROM watch_progress wp
      JOIN episodes e ON e.id = wp.episode_id
      WHERE wp.updated_at >= ${since}
      GROUP BY e.series_id
      ORDER BY viewers DESC, e.series_id
      LIMIT ${RANKINGS_SIZE * 5}`;
    if (ranking.length === 0) return { period, items: [] };
    const where = publishedSeriesWhere(viewer, now);
    const found = await this.prisma.series.findMany({
      where: {
        ...where,
        id: { in: ranking.map((r) => r.series_id) },
        ...(genre ? { genres: { has: genre } } : {}),
      },
      include: seriesInclude(now),
    });
    const byId = new Map(found.map((s) => [s.id, s]));
    const items = ranking
      .flatMap((r) => {
        const s = byId.get(r.series_id);
        return s ? [{ series: toSeriesSummary(s), viewers: r.viewers }] : [];
      })
      .slice(0, RANKINGS_SIZE)
      .map((item, index) => ({ rank: index + 1, ...item }));
    return { period, items };
  }
}
