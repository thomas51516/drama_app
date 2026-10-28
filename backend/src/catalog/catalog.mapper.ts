import { type Episode, type Subtitle } from '../generated/prisma/client.js';
import { type SeriesWithCount } from './catalog.where.js';
import {
  type EpisodeAccess,
  type EpisodeSummaryDto,
  type SeriesDetailDto,
  type SeriesSummaryDto,
} from './dto/catalog.dto.js';

export function toSeriesSummary(s: SeriesWithCount): SeriesSummaryDto {
  return {
    id: s.id,
    slug: s.slug,
    title: s.title,
    genres: s.genres,
    posterVerticalUrl: s.posterVerticalUrl,
    posterHorizontalUrl: s.posterHorizontalUrl,
    episodeCount: s._count.episodes,
    freeEpisodeCount: s.freeEpisodeCount,
    coinCostPerEpisode: s.coinCostPerEpisode,
    ageRating: s.ageRating,
    publishedAt: s.publishedAt?.toISOString() ?? null,
  };
}

export function toSeriesDetail(s: SeriesWithCount): SeriesDetailDto {
  return {
    ...toSeriesSummary(s),
    synopsis: s.synopsis,
    tags: s.tags,
    originalLanguage: s.originalLanguage,
    status: s.status,
  };
}

export function toEpisodeSummary(
  e: Episode & { subtitles?: Pick<Subtitle, 'language'>[] },
  access: EpisodeAccess,
  coinCostPerEpisode: number,
): EpisodeSummaryDto {
  return {
    id: e.id,
    seriesId: e.seriesId,
    number: e.number,
    title: e.title,
    durationSeconds: e.durationSeconds,
    thumbnailUrl: e.thumbnailUrl,
    access,
    coinCost: access === 'locked' ? coinCostPerEpisode : 0,
    subtitleLanguages: e.subtitles?.map((s) => s.language) ?? [],
    publishedAt: e.publishedAt?.toISOString() ?? null,
  };
}

/** Résout une clé de stockage relative en URL publique CDN ; laisse passer les URLs absolues (dev). */
export function resolveMediaUrl(key: string | null | undefined, cdnBaseUrl: string): string | null {
  if (!key) return null;
  if (/^https?:\/\//i.test(key)) return key;
  return `${cdnBaseUrl}/${key.replace(/^\/+/, '')}`;
}
