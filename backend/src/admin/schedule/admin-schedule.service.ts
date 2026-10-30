import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  type ScheduleDto,
  type ScheduleItemDto,
  type ScheduleQueryDto,
} from './dto/admin-schedule.dto.js';

export const SCHEDULE_DEFAULT_DAYS = 30;
export const SCHEDULE_MAX_DAYS = 366;

/** Calendrier des publications programmées (B-04) : séries et épisodes datés dans la fenêtre. */
@Injectable()
export class AdminScheduleService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ScheduleQueryDto, now = new Date()): Promise<ScheduleDto> {
    const from = query.from ? new Date(query.from) : now;
    const to = query.to
      ? new Date(query.to)
      : new Date(from.getTime() + SCHEDULE_DEFAULT_DAYS * 86_400_000);
    if (to.getTime() < from.getTime()) {
      throw new BadRequestException({
        code: 'SCHEDULE_RANGE_INVALID',
        message: '`to` is before `from`',
      });
    }
    if (to.getTime() - from.getTime() > SCHEDULE_MAX_DAYS * 86_400_000) {
      throw new BadRequestException({
        code: 'SCHEDULE_RANGE_TOO_WIDE',
        message: `Window must not exceed ${SCHEDULE_MAX_DAYS} days`,
      });
    }

    const [series, episodes] = await Promise.all([
      this.prisma.series.findMany({
        where: { status: { not: 'ARCHIVED' }, publishedAt: { gte: from, lte: to } },
        select: { id: true, title: true, status: true, publishedAt: true },
      }),
      this.prisma.episode.findMany({
        where: {
          publishedAt: { gte: from, lte: to },
          series: { status: { not: 'ARCHIVED' } },
        },
        select: {
          id: true,
          number: true,
          title: true,
          transcodeStatus: true,
          publishedAt: true,
          series: { select: { id: true, title: true, status: true } },
        },
      }),
    ]);

    const items: ScheduleItemDto[] = [
      ...series.map((s) => ({
        kind: 'series' as const,
        id: s.id,
        seriesId: s.id,
        seriesTitle: s.title,
        seriesStatus: s.status,
        episodeNumber: null,
        episodeTitle: null,
        transcodeStatus: null,
        publishedAt: s.publishedAt!.toISOString(),
        willBeVisible: s.status === 'PUBLISHED',
      })),
      ...episodes.map((e) => ({
        kind: 'episode' as const,
        id: e.id,
        seriesId: e.series.id,
        seriesTitle: e.series.title,
        seriesStatus: e.series.status,
        episodeNumber: e.number,
        episodeTitle: e.title,
        transcodeStatus: e.transcodeStatus,
        publishedAt: e.publishedAt!.toISOString(),
        willBeVisible: e.series.status === 'PUBLISHED' && e.transcodeStatus === 'READY',
      })),
    ].sort(
      (a, b) =>
        a.publishedAt.localeCompare(b.publishedAt) ||
        a.seriesTitle.localeCompare(b.seriesTitle) ||
        (a.episodeNumber ?? 0) - (b.episodeNumber ?? 0),
    );
    return { from: from.toISOString(), to: to.toISOString(), items };
  }
}
