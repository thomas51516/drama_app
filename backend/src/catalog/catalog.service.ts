import { Injectable, NotFoundException } from '@nestjs/common';
import { CatalogCacheService, SERIES_CACHE_TTL_SECONDS } from '../cache/catalog-cache.service.js';
import { normalizeCountry, pickLanguage } from '../common/i18n/accept-language.js';
import { AppConfig } from '../config/app-config.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  resolveMediaUrl,
  toEpisodeSummary,
  toSeriesDetail,
  toSeriesSummary,
  withAccess,
} from './catalog.mapper.js';
import {
  publishedSeriesWhere,
  seriesInclude,
  subtitleSelect,
  type ViewerContext,
  visibleEpisodeWhere,
} from './catalog.where.js';
import { computeAccess, EntitlementService, NO_ENTITLEMENTS } from './entitlement.service.js';
import {
  type EpisodeSummaryDto,
  type FeedQueryDto,
  type FeedResponseDto,
  type ListSeriesQueryDto,
  type PaginatedSeriesDto,
  type SeriesDetailDto,
} from './dto/catalog.dto.js';

/** En-têtes optionnels envoyés par l'application pour personnaliser le catalogue. */
export interface ViewerHeaders {
  /** `X-Country` : pays ISO 3166-1 alpha-2 (prioritaire sur le pays du compte). */
  country?: string;
  /** `Accept-Language`. */
  acceptLanguage?: string;
}

/** Épisodes d'une série, variante anonyme mise en cache ; l'accès est recalculé par spectateur. */
interface CachedEpisodes {
  freeEpisodeCount: number;
  coinCostPerEpisode: number;
  episodes: EpisodeSummaryDto[];
}

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementService,
    private readonly config: AppConfig,
    private readonly cache: CatalogCacheService,
  ) {}

  /**
   * Contexte spectateur : pays = `X-Country`, sinon pays du compte, sinon aucun filtre ;
   * langue = `Accept-Language` (repli fr).
   */
  async viewerContext(userId?: string, headers: ViewerHeaders = {}): Promise<ViewerContext> {
    const lang = pickLanguage(headers.acceptLanguage);
    let country = normalizeCountry(headers.country);
    if (!userId) return { country, lang };
    if (!country) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { country: true },
      });
      country = normalizeCountry(user?.country);
    }
    return { userId, country, lang };
  }

  async listSeries(query: ListSeriesQueryDto, viewer: ViewerContext): Promise<PaginatedSeriesDto> {
    const where = publishedSeriesWhere(viewer);
    if (query.genre) where.genres = { has: query.genre.toLowerCase() };
    const skip = (query.page - 1) * query.pageSize;

    const [items, total] = await Promise.all([
      this.prisma.series.findMany({
        where,
        include: seriesInclude(),
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
        skip,
        take: query.pageSize,
      }),
      this.prisma.series.count({ where }),
    ]);

    return { items: items.map(toSeriesSummary), page: query.page, pageSize: query.pageSize, total };
  }

  /** Fiche série : non personnalisée, mise en cache 120 s par (série, pays). */
  getSeries(id: string, viewer: ViewerContext): Promise<SeriesDetailDto> {
    return this.cache.remember(
      CatalogCacheService.seriesKey(id, 'detail', viewer.country),
      SERIES_CACHE_TTL_SECONDS,
      async () => {
        const series = await this.prisma.series.findFirst({
          where: { id, ...publishedSeriesWhere(viewer) },
          include: seriesInclude(),
        });
        if (!series) {
          throw new NotFoundException({ code: 'SERIES_NOT_FOUND', message: 'Series not found' });
        }
        return toSeriesDetail(series);
      },
    );
  }

  /**
   * Grille des épisodes : la liste anonyme (gratuit / verrouillé) est mise en cache 120 s par
   * (série, pays) ; pour un spectateur connecté, l'accès est recalculé après lecture du cache.
   */
  async listEpisodes(seriesId: string, viewer: ViewerContext): Promise<EpisodeSummaryDto[]> {
    const cached = await this.cache.remember(
      CatalogCacheService.seriesKey(seriesId, 'episodes', viewer.country),
      SERIES_CACHE_TTL_SECONDS,
      () => this.loadEpisodes(seriesId, viewer),
    );
    if (!viewer.userId) return cached.episodes;

    const entitlements = await this.entitlements.forViewer(
      viewer.userId,
      cached.episodes.map((e) => e.id),
    );
    return cached.episodes.map((e) =>
      withAccess(e, computeAccess(e, cached, entitlements), cached.coinCostPerEpisode),
    );
  }

  private async loadEpisodes(seriesId: string, viewer: ViewerContext): Promise<CachedEpisodes> {
    const series = await this.prisma.series.findFirst({
      where: { id: seriesId, ...publishedSeriesWhere(viewer) },
      select: { id: true, freeEpisodeCount: true, coinCostPerEpisode: true },
    });
    if (!series) {
      throw new NotFoundException({ code: 'SERIES_NOT_FOUND', message: 'Series not found' });
    }
    const episodes = await this.prisma.episode.findMany({
      where: { seriesId, ...visibleEpisodeWhere() },
      include: { subtitles: subtitleSelect },
      orderBy: { number: 'asc' },
    });
    return {
      freeEpisodeCount: series.freeEpisodeCount,
      coinCostPerEpisode: series.coinCostPerEpisode,
      episodes: episodes.map((e) =>
        toEpisodeSummary(
          e,
          computeAccess(e, series, NO_ENTITLEMENTS),
          series.coinCostPerEpisode,
          this.config.cdnBaseUrl,
        ),
      ),
    };
  }

  /** Flux vertical « Pour vous » (M-02) : premier épisode de chaque série publiée. TODO S04-BE-03 personnalisation. */
  async getFeed(query: FeedQueryDto, viewer: ViewerContext): Promise<FeedResponseDto> {
    const offset = decodeCursor(query.cursor);
    const episodes = await this.prisma.episode.findMany({
      where: { number: 1, ...visibleEpisodeWhere(), series: publishedSeriesWhere(viewer) },
      include: { series: { include: seriesInclude() }, subtitles: subtitleSelect },
      orderBy: [{ series: { publishedAt: 'desc' } }, { id: 'desc' }],
      skip: offset,
      take: query.limit + 1,
    });

    const hasMore = episodes.length > query.limit;
    const page = hasMore ? episodes.slice(0, query.limit) : episodes;
    const entitlements = await this.entitlements.forViewer(
      viewer.userId,
      page.map((e) => e.id),
    );

    return {
      items: page.map((e) => ({
        series: toSeriesSummary(e.series),
        episode: toEpisodeSummary(
          e,
          computeAccess(e, e.series, entitlements),
          e.series.coinCostPerEpisode,
          this.config.cdnBaseUrl,
        ),
        previewUrl: resolveMediaUrl(e.previewKey, this.config.cdnBaseUrl),
      })),
      nextCursor: hasMore ? encodeCursor(offset + query.limit) : null,
    };
  }
}

function encodeCursor(offset: number): string {
  return Buffer.from(String(offset), 'utf8').toString('base64url');
}

function decodeCursor(cursor?: string): number {
  if (!cursor) return 0;
  const n = Number.parseInt(Buffer.from(cursor, 'base64url').toString('utf8'), 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
