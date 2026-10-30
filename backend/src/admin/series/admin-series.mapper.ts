import { type Prisma } from '../../generated/prisma/client.js';
import { type AdminSeriesDto } from './dto/admin-series.dto.js';

export const adminSeriesInclude = {
  _count: { select: { episodes: true } },
} satisfies Prisma.SeriesInclude;

export type AdminSeriesRecord = Prisma.SeriesGetPayload<{ include: typeof adminSeriesInclude }>;

export function toAdminSeries(s: AdminSeriesRecord): AdminSeriesDto {
  return {
    id: s.id,
    slug: s.slug,
    title: s.title,
    synopsis: s.synopsis,
    genres: s.genres,
    tags: s.tags,
    language: s.originalLanguage,
    ageRating: s.ageRating,
    posterVerticalUrl: s.posterVerticalUrl,
    posterHorizontalUrl: s.posterHorizontalUrl,
    freeEpisodeCount: s.freeEpisodeCount,
    coinCostPerEpisode: s.coinCostPerEpisode,
    adUnlockEnabled: s.adUnlockEnabled,
    status: s.status,
    territories: s.territories,
    episodeCount: s._count.episodes,
    publishedAt: s.publishedAt?.toISOString() ?? null,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}
