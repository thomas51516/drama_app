import { Injectable } from '@nestjs/common';
import { CatalogCacheService, HOME_CACHE_TTL_SECONDS } from '../cache/catalog-cache.service.js';
import { DEFAULT_LANGUAGE, type SupportedLanguage } from '../common/i18n/accept-language.js';
import { AppConfig } from '../config/app-config.js';
import { type HomeBanner, type HomeRow, type Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { toEpisodeSummary, toSeriesSummary } from './catalog.mapper.js';
import {
  publishedSeriesWhere,
  seriesInclude,
  type SeriesWithCount,
  subtitleSelect,
  type ViewerContext,
  visibleEpisodeWhere,
} from './catalog.where.js';
import { computeAccess, EntitlementService } from './entitlement.service.js';
import { PersonalizationService } from './personalization.service.js';
import {
  type HomeBannerDto,
  type HomeItemDto,
  type HomeResponseDto,
  type HomeRowDto,
} from './dto/catalog.dto.js';

/** Nombre maximal de séries par rangée. */
export const HOME_ROW_SIZE = 12;
/** Fenêtre de calcul de « Tendances » : progressions de lecture mises à jour sur 7 jours. */
export const TRENDING_WINDOW_DAYS = 7;
const CONTINUE_WATCHING_SIZE = 10;

/** Réponse partagée (mise en cache) : tout sauf les éléments de « Continuer à regarder ». */
interface SharedHome {
  banners: HomeBannerDto[];
  /** Les rangées CONTINUE_WATCHING sont présentes avec `items: []` (remplies par spectateur). */
  rows: HomeRowDto[];
}

export type HomeTitles = Partial<Record<SupportedLanguage, string | null>>;

/** Un élément de configuration s'applique au pays du spectateur (inconnu = pas de filtre). */
export function matchesCountry(countries: string[], country: string | null | undefined): boolean {
  if (countries.length === 0 || !country) return true;
  return countries.includes(country);
}

/** Titre d'une rangée dans la langue demandée, repli fr puis première valeur puis clé. */
export function pickTitle(titles: unknown, lang: SupportedLanguage, fallback: string): string {
  const t = (titles ?? {}) as HomeTitles;
  const value = t[lang] || t[DEFAULT_LANGUAGE] || Object.values(t).find((v) => !!v);
  return value || fallback;
}

/**
 * Construction de l'accueil (M-01) à partir de la configuration B-05 (`home_banners`, `home_rows`),
 * filtrée par pays, titrée par langue, mise en cache 60 s par (pays, langue) — S04-BE-01 / S04-BE-04.
 */
@Injectable()
export class HomeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementService,
    private readonly cache: CatalogCacheService,
    private readonly config: AppConfig,
    private readonly personalization: PersonalizationService,
  ) {}

  /** `fresh` contourne le cache (aperçu back-office). */
  async getHome(
    viewer: ViewerContext,
    options: { fresh?: boolean } = {},
  ): Promise<HomeResponseDto> {
    const lang = viewer.lang ?? DEFAULT_LANGUAGE;
    const country = viewer.country ?? null;
    const shared = await this.cache.remember(
      CatalogCacheService.homeKey(country, lang),
      HOME_CACHE_TTL_SECONDS,
      () => this.buildShared(country, lang),
      options.fresh,
    );

    const rows: HomeRowDto[] = [];
    for (const row of shared.rows) {
      if (row.type !== 'CONTINUE_WATCHING') {
        rows.push(row);
        continue;
      }
      if (!viewer.userId) continue;
      const items = await this.continueWatchingItems(viewer.userId, country);
      if (items.length > 0) rows.push({ ...row, items });
    }
    return this.personalize(viewer.userId, { banners: shared.banners, rows });
  }

  /** `isFavorite` / `likes` par spectateur, calculés après le cache (S05-BE-05). */
  private async personalize(
    userId: string | undefined,
    home: HomeResponseDto,
  ): Promise<HomeResponseDto> {
    if (!userId) return home;
    const banners = await this.personalization.decorate(userId, home.banners);
    const rows: HomeRowDto[] = [];
    for (const row of home.rows) {
      const series = await this.personalization.decorate(
        userId,
        row.items.map((i) => i.series),
      );
      rows.push({ ...row, items: row.items.map((item, i) => ({ ...item, series: series[i] })) });
    }
    return { banners, rows };
  }

  private async buildShared(country: string | null, lang: SupportedLanguage): Promise<SharedHome> {
    const now = new Date();
    const [bannerConfig, rowConfig] = await Promise.all([
      this.prisma.homeBanner.findMany({
        where: {
          isActive: true,
          AND: [
            { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
            { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
          ],
        },
        include: { series: { include: seriesInclude(now) } },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.homeRow.findMany({
        where: { isActive: true },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      }),
    ]);

    const banners = bannerConfig
      .filter((b) => matchesCountry(b.countries, country) && seriesVisible(b.series, country))
      .map((b) => toHomeBanner(b, b.series));

    const where = publishedSeriesWhere({ country });
    const rows: HomeRowDto[] = [];
    for (const row of rowConfig) {
      if (!matchesCountry(row.countries, country)) continue;
      const title = pickTitle(row.titles, lang, row.key);
      if (row.type === 'CONTINUE_WATCHING') {
        rows.push({ key: row.key, type: row.type, title, items: [] });
        continue;
      }
      const series = await this.seriesForRow(row, where, now);
      if (series.length === 0) continue;
      rows.push({
        key: row.key,
        type: row.type,
        title,
        items: series.map((s) => ({ series: toSeriesSummary(s) })),
      });
    }
    return { banners, rows };
  }

  private seriesForRow(
    row: HomeRow,
    where: Prisma.SeriesWhereInput,
    now: Date,
  ): Promise<SeriesWithCount[]> {
    const include = seriesInclude(now);
    switch (row.type) {
      case 'TRENDING':
        return this.trendingSeries(where, now);
      case 'NEW':
        return this.prisma.series.findMany({
          where,
          include,
          orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
          take: HOME_ROW_SIZE,
        });
      case 'GENRE': {
        if (!row.genre) return Promise.resolve([]);
        return this.prisma.series.findMany({
          where: { ...where, genres: { has: row.genre.toLowerCase() } },
          include,
          orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
          take: HOME_ROW_SIZE,
        });
      }
      case 'MANUAL':
        return this.manualSeries(row.seriesIds, where, now);
      default:
        return Promise.resolve([]);
    }
  }

  /** Liste ordonnée par l'éditeur ; les séries non publiées ou hors territoire sont ignorées. */
  private async manualSeries(
    seriesIds: string[],
    where: Prisma.SeriesWhereInput,
    now: Date,
  ): Promise<SeriesWithCount[]> {
    if (seriesIds.length === 0) return [];
    const found = await this.prisma.series.findMany({
      where: { ...where, id: { in: seriesIds } },
      include: seriesInclude(now),
    });
    const byId = new Map(found.map((s) => [s.id, s]));
    return seriesIds.flatMap((id) => byId.get(id) ?? []).slice(0, HOME_ROW_SIZE);
  }

  /**
   * « Tendances » : séries classées par nombre de spectateurs distincts dont la progression a été mise
   * à jour sur les 7 derniers jours ; complétées par les dernières publications si moins de 12.
   */
  private async trendingSeries(
    where: Prisma.SeriesWhereInput,
    now: Date,
  ): Promise<SeriesWithCount[]> {
    const since = new Date(now.getTime() - TRENDING_WINDOW_DAYS * 86_400_000);
    const ranking = await this.prisma.$queryRaw<{ series_id: string; viewers: number }[]>`
      SELECT e.series_id, COUNT(DISTINCT wp.user_id)::int AS viewers
      FROM watch_progress wp
      JOIN episodes e ON e.id = wp.episode_id
      WHERE wp.updated_at >= ${since}
      GROUP BY e.series_id
      ORDER BY viewers DESC, e.series_id
      LIMIT ${HOME_ROW_SIZE * 4}`;
    const rankedIds = ranking.map((r) => r.series_id);
    const include = seriesInclude(now);
    const ranked =
      rankedIds.length === 0
        ? []
        : await this.prisma.series.findMany({
            where: { ...where, id: { in: rankedIds } },
            include,
          });
    const byId = new Map(ranked.map((s) => [s.id, s]));
    const ordered = rankedIds.flatMap((id) => byId.get(id) ?? []).slice(0, HOME_ROW_SIZE);
    if (ordered.length >= HOME_ROW_SIZE) return ordered;
    const filler = await this.prisma.series.findMany({
      where: { ...where, id: { notIn: ordered.map((s) => s.id) } },
      include,
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      take: HOME_ROW_SIZE - ordered.length,
    });
    return [...ordered, ...filler];
  }

  /** « Continuer à regarder » (M-15) : jamais mis en cache, calculé par spectateur. */
  private async continueWatchingItems(
    userId: string,
    country: string | null,
  ): Promise<HomeItemDto[]> {
    const seriesWhere = publishedSeriesWhere({ country });
    const progress = await this.prisma.watchProgress.findMany({
      where: {
        userId,
        completed: false,
        episode: { ...visibleEpisodeWhere(), series: seriesWhere },
      },
      include: {
        episode: {
          include: { series: { include: seriesInclude() }, subtitles: subtitleSelect },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: CONTINUE_WATCHING_SIZE,
    });
    if (progress.length === 0) return [];
    const entitlements = await this.entitlements.forViewer(
      userId,
      progress.map((p) => p.episodeId),
    );
    return progress.map((p) => ({
      series: toSeriesSummary(p.episode.series),
      episode: toEpisodeSummary(
        p.episode,
        computeAccess(p.episode, p.episode.series, entitlements),
        p.episode.series.coinCostPerEpisode,
        this.config.cdnBaseUrl,
      ),
      positionSeconds: p.positionSeconds,
    }));
  }
}

function seriesVisible(series: SeriesWithCount, country: string | null): boolean {
  if (series.status !== 'PUBLISHED') return false;
  return series.territories.length === 0 || !country || series.territories.includes(country);
}

function toHomeBanner(banner: HomeBanner, series: SeriesWithCount): HomeBannerDto {
  return {
    ...toSeriesSummary(series),
    bannerId: banner.id,
    imageUrl: banner.imageUrl ?? series.posterHorizontalUrl,
    bannerTitle: banner.title,
    bannerSubtitle: banner.subtitle,
  };
}
