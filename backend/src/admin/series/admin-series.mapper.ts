import { type Prisma } from '../../generated/prisma/client.js';
import { toRightsContractDto } from '../rights/admin-rights.mapper.js';
import { computeRightsStatus } from '../rights/rights-status.js';
import { type AdminSeriesDto } from './dto/admin-series.dto.js';

export const adminSeriesInclude = {
  _count: { select: { episodes: true } },
  rightsContract: true,
} satisfies Prisma.SeriesInclude;

export type AdminSeriesRecord = Prisma.SeriesGetPayload<{ include: typeof adminSeriesInclude }>;

export function toAdminSeries(s: AdminSeriesRecord, now: Date = new Date()): AdminSeriesDto {
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
    rightsStatus: computeRightsStatus(s.rightsContract, now),
    rightsContract: s.rightsContract ? toRightsContractDto(s.rightsContract) : null,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}
