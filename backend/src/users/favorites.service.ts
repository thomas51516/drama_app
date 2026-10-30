import { Injectable, NotFoundException } from '@nestjs/common';
import { toSeriesSummary } from '../catalog/catalog.mapper.js';
import { seriesInclude } from '../catalog/catalog.where.js';
import { type LikeResultDto } from '../catalog/dto/catalog.dto.js';
import { PersonalizationService } from '../catalog/personalization.service.js';
import { type Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { type FavoritesPageDto, type FavoritesQueryDto } from './dto/users.dto.js';

/** « Ma liste » et « J'aime » (S05-BE-05, M-16). Opérations idempotentes, compteur en projection. */
@Injectable()
export class FavoritesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly personalization: PersonalizationService,
  ) {}

  async list(userId: string, query: FavoritesQueryDto): Promise<FavoritesPageDto> {
    const where: Prisma.FavoriteWhereInput = { userId, series: { status: 'PUBLISHED' } };
    const [rows, total] = await Promise.all([
      this.prisma.favorite.findMany({
        where,
        include: { series: { include: seriesInclude() } },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.favorite.count({ where }),
    ]);
    const items = await this.personalization.decorate(
      userId,
      rows.map((r) => toSeriesSummary(r.series)),
    );
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async add(userId: string, seriesId: string): Promise<void> {
    await this.assertSeries(seriesId);
    await this.prisma.favorite.upsert({
      where: { userId_seriesId: { userId, seriesId } },
      create: { userId, seriesId },
      update: {},
    });
  }

  async remove(userId: string, seriesId: string): Promise<void> {
    await this.prisma.favorite.deleteMany({ where: { userId, seriesId } });
  }

  async like(userId: string, seriesId: string): Promise<LikeResultDto> {
    await this.assertSeries(seriesId);
    const likes = await this.prisma.$transaction(async (tx) => {
      // ON CONFLICT plutôt qu'un rattrapage de P2002 : une violation d'unicité annulerait la transaction.
      const inserted = await tx.$executeRaw`
        INSERT INTO likes (user_id, series_id) VALUES (${userId}::uuid, ${seriesId}::uuid)
        ON CONFLICT DO NOTHING`;
      if (inserted === 0) {
        const s = await tx.series.findUniqueOrThrow({
          where: { id: seriesId },
          select: { likesCount: true },
        });
        return s.likesCount;
      }
      const s = await tx.series.update({
        where: { id: seriesId },
        data: { likesCount: { increment: 1 } },
        select: { likesCount: true },
      });
      return s.likesCount;
    });
    return { likes, liked: true };
  }

  async unlike(userId: string, seriesId: string): Promise<LikeResultDto> {
    await this.assertSeries(seriesId);
    const likes = await this.prisma.$transaction(async (tx) => {
      const removed = await tx.like.deleteMany({ where: { userId, seriesId } });
      if (removed.count === 0) {
        const s = await tx.series.findUniqueOrThrow({
          where: { id: seriesId },
          select: { likesCount: true },
        });
        return s.likesCount;
      }
      const s = await tx.series.update({
        where: { id: seriesId },
        data: { likesCount: { decrement: 1 } },
        select: { likesCount: true },
      });
      return Math.max(0, s.likesCount);
    });
    return { likes, liked: false };
  }

  private async assertSeries(seriesId: string): Promise<void> {
    const series = await this.prisma.series.findFirst({
      where: { id: seriesId, status: 'PUBLISHED' },
      select: { id: true },
    });
    if (!series) {
      throw new NotFoundException({ code: 'SERIES_NOT_FOUND', message: 'Series not found' });
    }
  }
}
