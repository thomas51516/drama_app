import { Injectable, NotFoundException } from '@nestjs/common';
import { AppConfig } from '../config/app-config.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  resolveMediaUrl,
  toEpisodeSummary,
  toSeriesDetail,
  toSeriesSummary,
} from './catalog.mapper.js';
import {
  publishedSeriesWhere,
  seriesInclude,
  type ViewerContext,
  visibleEpisodeWhere,
} from './catalog.where.js';
import { computeAccess, EntitlementService } from './entitlement.service.js';
import {
  type EpisodeSummaryDto,
  type FeedQueryDto,
  type FeedResponseDto,
  type HomeItemDto,
  type HomeResponseDto,
  type HomeRowDto,
  type ListSeriesQueryDto,
  type PaginatedSeriesDto,
  type SeriesDetailDto,
} from './dto/catalog.dto.js';

const HOME_ROW_SIZE = 12;
const HOME_GENRE_ROWS = 4;

// TODO S04-BE-01 : rangées paramétrées en back-office (B-05) et métriques réelles pour « Tendances ».
// TODO S04-BE-04 : cache Redis du catalogue, invalidation à la publication.
// TODO S05 : titres des rangées localisés selon Accept-Language (fr au MVP).
const ROW_TITLES: Record<string, string> = {
  trending: 'Tendances',
  new: 'Nouveautés',
  continue_watching: 'Continuer à regarder',
};

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementService,
    private readonly config: AppConfig,
  ) {}

  /** Contexte spectateur : pays (filtre territorial) issu du compte si connecté. */
  async viewerContext(userId?: string): Promise<ViewerContext> {
    if (!userId) return {};
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { country: true },
    });
    return { userId, country: user?.country ?? null };
  }

  async getHome(viewer: ViewerContext): Promise<HomeResponseDto> {
    const where = publishedSeriesWhere(viewer);
    const include = seriesInclude();

    const [banners, trending, latest] = await Promise.all([
      this.prisma.series.findMany({ where, include, orderBy: { publishedAt: 'desc' }, take: 5 }),
      this.prisma.series.findMany({
        where,
        include,
        orderBy: { updatedAt: 'desc' },
        take: HOME_ROW_SIZE,
      }),
      this.prisma.series.findMany({
        where,
        include,
        orderBy: { publishedAt: 'desc' },
        take: HOME_ROW_SIZE,
      }),
    ]);

    const rows: HomeRowDto[] = [];
    const toRow = (key: string, items: HomeItemDto[]): HomeRowDto => ({
      key,
      title: ROW_TITLES[key] ?? key,
      items,
    });

    rows.push(
      toRow(
        'trending',
        trending.map((s) => ({ series: toSeriesSummary(s) })),
      ),
    );

    if (viewer.userId) {
      const continueRow = await this.continueWatchingRow(viewer.userId, where);
      if (continueRow.items.length > 0) rows.push(continueRow);
    }

    rows.push(
      toRow(
        'new',
        latest.map((s) => ({ series: toSeriesSummary(s) })),
      ),
    );

    const genres = [...new Set([...trending, ...latest].flatMap((s) => s.genres))].slice(
      0,
      HOME_GENRE_ROWS,
    );
    const genreRows = await Promise.all(
      genres.map((genre) =>
        this.prisma.series.findMany({
          where: { ...where, genres: { has: genre } },
          include,
          orderBy: { publishedAt: 'desc' },
          take: HOME_ROW_SIZE,
        }),
      ),
    );
    genres.forEach((genre, i) => {
      const list = genreRows[i] ?? [];
      if (list.length > 0) {
        rows.push({
          key: `genre:${genre}`,
          title: capitalize(genre),
          items: list.map((s) => ({ series: toSeriesSummary(s) })),
        });
      }
    });

    return { banners: banners.map(toSeriesSummary), rows };
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

  async getSeries(id: string, viewer: ViewerContext): Promise<SeriesDetailDto> {
    const series = await this.prisma.series.findFirst({
      where: { id, ...publishedSeriesWhere(viewer) },
      include: seriesInclude(),
    });
    if (!series) {
      throw new NotFoundException({ code: 'SERIES_NOT_FOUND', message: 'Series not found' });
    }
    return toSeriesDetail(series);
  }

  async listEpisodes(seriesId: string, viewer: ViewerContext): Promise<EpisodeSummaryDto[]> {
    const series = await this.prisma.series.findFirst({
      where: { id: seriesId, ...publishedSeriesWhere(viewer) },
      select: { id: true, freeEpisodeCount: true, coinCostPerEpisode: true },
    });
    if (!series) {
      throw new NotFoundException({ code: 'SERIES_NOT_FOUND', message: 'Series not found' });
    }

    const episodes = await this.prisma.episode.findMany({
      where: { seriesId, ...visibleEpisodeWhere() },
      include: { subtitles: { select: { language: true } } },
      orderBy: { number: 'asc' },
    });
    const entitlements = await this.entitlements.forViewer(
      viewer.userId,
      episodes.map((e) => e.id),
    );

    return episodes.map((e) =>
      toEpisodeSummary(e, computeAccess(e, series, entitlements), series.coinCostPerEpisode),
    );
  }

  /** Flux vertical « Pour vous » (M-02) : premier épisode de chaque série publiée. TODO S04-BE-03 personnalisation. */
  async getFeed(query: FeedQueryDto, viewer: ViewerContext): Promise<FeedResponseDto> {
    const offset = decodeCursor(query.cursor);
    const episodes = await this.prisma.episode.findMany({
      where: { number: 1, ...visibleEpisodeWhere(), series: publishedSeriesWhere(viewer) },
      include: { series: { include: seriesInclude() }, subtitles: { select: { language: true } } },
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
        ),
        previewUrl: resolveMediaUrl(e.previewKey, this.config.cdnBaseUrl),
      })),
      nextCursor: hasMore ? encodeCursor(offset + query.limit) : null,
    };
  }

  private async continueWatchingRow(
    userId: string,
    seriesWhere: ReturnType<typeof publishedSeriesWhere>,
  ): Promise<HomeRowDto> {
    const progress = await this.prisma.watchProgress.findMany({
      where: {
        userId,
        completed: false,
        episode: { ...visibleEpisodeWhere(), series: seriesWhere },
      },
      include: { episode: { include: { series: { include: seriesInclude() } } } },
      orderBy: { updatedAt: 'desc' },
      take: 10,
    });
    const entitlements = await this.entitlements.forViewer(
      userId,
      progress.map((p) => p.episodeId),
    );
    return {
      key: 'continue_watching',
      title: ROW_TITLES.continue_watching ?? 'continue_watching',
      items: progress.map((p) => ({
        series: toSeriesSummary(p.episode.series),
        episode: toEpisodeSummary(
          p.episode,
          computeAccess(p.episode, p.episode.series, entitlements),
          p.episode.series.coinCostPerEpisode,
        ),
        positionSeconds: p.positionSeconds,
      })),
    };
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function encodeCursor(offset: number): string {
  return Buffer.from(String(offset), 'utf8').toString('base64url');
}

function decodeCursor(cursor?: string): number {
  if (!cursor) return 0;
  const n = Number.parseInt(Buffer.from(cursor, 'base64url').toString('utf8'), 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
