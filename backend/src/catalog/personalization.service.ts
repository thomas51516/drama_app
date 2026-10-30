import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { type SeriesSummaryDto } from './dto/catalog.dto.js';

/**
 * Enrichissement par spectateur des résumés de séries (S05-BE-05) : `isFavorite` et `likes`.
 * Toujours appliqué APRÈS le cache (jamais dans une charge utile mise en cache), et uniquement
 * quand un jeton est présent (contrat public v1.2).
 */
@Injectable()
export class PersonalizationService {
  constructor(private readonly prisma: PrismaService) {}

  async decorate<T extends SeriesSummaryDto>(userId: string | undefined, items: T[]): Promise<T[]> {
    if (!userId || items.length === 0) return items;
    const ids = [...new Set(items.map((s) => s.id))];
    const [favorites, counts] = await Promise.all([
      this.prisma.favorite.findMany({
        where: { userId, seriesId: { in: ids } },
        select: { seriesId: true },
      }),
      this.prisma.series.findMany({
        where: { id: { in: ids } },
        select: { id: true, likesCount: true },
      }),
    ]);
    const favoriteIds = new Set(favorites.map((f) => f.seriesId));
    const likes = new Map(counts.map((c) => [c.id, c.likesCount]));
    return items.map((s) => ({
      ...s,
      isFavorite: favoriteIds.has(s.id),
      likes: likes.get(s.id) ?? 0,
    }));
  }

  async favoriteIds(userId: string | undefined, seriesIds: string[]): Promise<Set<string>> {
    if (!userId || seriesIds.length === 0) return new Set();
    const rows = await this.prisma.favorite.findMany({
      where: { userId, seriesId: { in: seriesIds } },
      select: { seriesId: true },
    });
    return new Set(rows.map((r) => r.seriesId));
  }
}
