import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { toSeriesSummary } from './catalog.mapper.js';
import { seriesInclude, type ViewerContext } from './catalog.where.js';
import {
  type SearchQueryDto,
  type SearchResponseDto,
  type SeriesSummaryDto,
} from './dto/catalog.dto.js';
import { prepareSearch } from './search-query.js';

export const SUGGESTIONS_LIMIT = 8;

/**
 * Recherche plein texte PostgreSQL (S05-BE-06, M-03) : `series.search_vector` (titre A, tags et
 * genres B, synopsis C ; dictionnaires `french` + `simple`, sans accent) interrogé avec
 * `websearch_to_tsquery('french')` et une requête préfixe `simple`, classement `ts_rank_cd`.
 * Séries publiées (date atteinte) et autorisées sur le territoire seulement.
 */
@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(query: SearchQueryDto, viewer: ViewerContext): Promise<SearchResponseDto> {
    const prepared = prepareSearch(query.q);
    const empty = { items: [], total: 0, page: query.page, pageSize: query.pageSize };
    if (prepared.terms.length === 0) return { ...empty, suggestions: [] };

    const genre = query.genre?.trim().toLowerCase() || null;
    const filters = Prisma.sql`
      s.status = 'PUBLISHED' AND s.published_at IS NOT NULL AND s.published_at <= now()
      ${viewer.country ? Prisma.sql`AND (cardinality(s.territories) = 0 OR ${viewer.country} = ANY(s.territories))` : Prisma.empty}
      ${genre ? Prisma.sql`AND ${genre} = ANY(s.genres)` : Prisma.empty}`;
    const match = Prisma.sql`(
      s.search_vector @@ websearch_to_tsquery('french', f_unaccent(${prepared.text}))
      OR s.search_vector @@ to_tsquery('simple', ${prepared.prefixQuery}))`;
    const offset = (query.page - 1) * query.pageSize;

    const [ranked, counted, suggestions] = await Promise.all([
      this.prisma.$queryRaw<{ id: string }[]>`
        SELECT s.id
        FROM series s
        WHERE ${filters} AND ${match}
        ORDER BY
          ts_rank_cd(s.search_vector, websearch_to_tsquery('french', f_unaccent(${prepared.text})), 32)
          + ts_rank_cd(s.search_vector, to_tsquery('simple', ${prepared.prefixQuery}), 32) DESC,
          s.published_at DESC, s.id DESC
        LIMIT ${query.pageSize} OFFSET ${offset}`,
      this.prisma.$queryRaw<{ total: number }[]>`
        SELECT COUNT(*)::int AS total FROM series s WHERE ${filters} AND ${match}`,
      this.suggest(query.q, viewer),
    ]);

    const ids = ranked.map((r) => r.id);
    const items = await this.summariesInOrder(ids);
    return {
      items,
      total: counted[0]?.total ?? 0,
      page: query.page,
      pageSize: query.pageSize,
      suggestions,
    };
  }

  /** Suggestions : titres de séries publiées dont le titre (ou un mot du titre) commence par le préfixe. */
  async suggest(raw: string, viewer: ViewerContext): Promise<string[]> {
    const prepared = prepareSearch(raw);
    if (prepared.likePrefix.length === 0) return [];
    const starts = `${prepared.likePrefix}%`;
    const word = `% ${prepared.likePrefix}%`;
    const rows = await this.prisma.$queryRaw<{ title: string }[]>`
      SELECT s.title
      FROM series s
      WHERE s.status = 'PUBLISHED' AND s.published_at IS NOT NULL AND s.published_at <= now()
        ${viewer.country ? Prisma.sql`AND (cardinality(s.territories) = 0 OR ${viewer.country} = ANY(s.territories))` : Prisma.empty}
        AND (f_unaccent(lower(s.title)) LIKE ${starts} OR f_unaccent(lower(s.title)) LIKE ${word})
      ORDER BY (f_unaccent(lower(s.title)) LIKE ${starts}) DESC, s.title ASC
      LIMIT ${SUGGESTIONS_LIMIT}`;
    return [...new Set(rows.map((r) => r.title))];
  }

  private async summariesInOrder(ids: string[]): Promise<SeriesSummaryDto[]> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.series.findMany({
      where: { id: { in: ids } },
      include: seriesInclude(),
    });
    const byId = new Map(rows.map((s) => [s.id, toSeriesSummary(s)]));
    return ids.flatMap((id) => byId.get(id) ?? []);
  }
}
