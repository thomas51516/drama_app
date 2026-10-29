import { type SupportedLanguage } from '../common/i18n/accept-language.js';
import { type Prisma } from '../generated/prisma/client.js';

export interface ViewerContext {
  userId?: string;
  /** Pays ISO 3166-1 alpha-2 (en-tête `X-Country`, sinon pays du compte), pour les filtres territoriaux. */
  country?: string | null;
  /** Langue d'affichage issue de `Accept-Language` (repli fr). */
  lang?: SupportedLanguage;
}

/** Séries visibles par le public : publiées et autorisées sur le territoire du spectateur. */
export function publishedSeriesWhere(viewer: ViewerContext): Prisma.SeriesWhereInput {
  const where: Prisma.SeriesWhereInput = { status: 'PUBLISHED' };
  if (viewer.country) {
    where.OR = [{ territories: { isEmpty: true } }, { territories: { has: viewer.country } }];
  }
  return where;
}

/** Épisodes visibles : publiés (date atteinte) et prêts à la lecture. */
export function visibleEpisodeWhere(now = new Date()): Prisma.EpisodeWhereInput {
  return { publishedAt: { lte: now }, transcodeStatus: 'READY' };
}

/** Pistes de sous-titres d'un épisode (B-03), triées par langue. */
export const subtitleSelect = {
  select: { language: true, fileUrl: true },
  orderBy: { language: 'asc' },
} satisfies Prisma.Episode$subtitlesArgs;

/** Inclusion standard : nombre d'épisodes visibles de la série. */
export function seriesInclude(now = new Date()) {
  return {
    _count: { select: { episodes: { where: visibleEpisodeWhere(now) } } },
  } satisfies Prisma.SeriesInclude;
}

export type SeriesWithCount = Prisma.SeriesGetPayload<{
  include: ReturnType<typeof seriesInclude>;
}>;
