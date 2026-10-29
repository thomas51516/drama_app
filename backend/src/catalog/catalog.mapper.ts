import { languageLabel } from '../common/i18n/language-label.js';
import { type Episode, type Subtitle } from '../generated/prisma/client.js';
import { type SeriesWithCount } from './catalog.where.js';
import {
  type EpisodeAccess,
  type EpisodeSummaryDto,
  type SeriesDetailDto,
  type SeriesSummaryDto,
  type SubtitleTrackDto,
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

export function toSubtitleTrack(
  s: Pick<Subtitle, 'language' | 'fileUrl'>,
  cdnBaseUrl: string,
): SubtitleTrackDto {
  return {
    language: s.language,
    label: languageLabel(s.language),
    url: resolveMediaUrl(s.fileUrl, cdnBaseUrl) ?? s.fileUrl,
  };
}

export function toEpisodeSummary(
  e: Episode & { subtitles?: Pick<Subtitle, 'language' | 'fileUrl'>[] },
  access: EpisodeAccess,
  coinCostPerEpisode: number,
  cdnBaseUrl: string,
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
    subtitles: e.subtitles?.map((s) => toSubtitleTrack(s, cdnBaseUrl)) ?? [],
    publishedAt: e.publishedAt?.toISOString() ?? null,
  };
}

/** Recalcule le statut d'accès d'un résumé d'épisode (après lecture du cache, par spectateur). */
export function withAccess(
  summary: EpisodeSummaryDto,
  access: EpisodeAccess,
  coinCostPerEpisode: number,
): EpisodeSummaryDto {
  return { ...summary, access, coinCost: access === 'locked' ? coinCostPerEpisode : 0 };
}

/** Résout une clé de stockage relative en URL publique CDN ; laisse passer les URLs absolues (dev). */
export function resolveMediaUrl(key: string | null | undefined, cdnBaseUrl: string): string | null {
  if (!key) return null;
  if (/^https?:\/\//i.test(key)) return key;
  return `${cdnBaseUrl}/${key.replace(/^\/+/, '')}`;
}
