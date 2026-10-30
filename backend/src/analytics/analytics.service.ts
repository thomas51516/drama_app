import { BadRequestException, Injectable } from '@nestjs/common';
import { type Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  ANALYTICS_PARAMS_MAX_BYTES,
  type AnalyticsEventInputDto,
  type PostEventsDto,
  type PostEventsResultDto,
} from './dto/analytics.dto.js';

export interface EventContext {
  userId?: string | null;
  country?: string | null;
}

/** Tolérance sur l'horodatage appareil : au-delà, on garde l'heure de réception. */
export const MAX_CLOCK_SKEW_MS = 7 * 86_400_000;

/**
 * Événements d'analyse côté serveur (§13, S06-BE-03) : validation du nom (liste fermée), de la
 * taille des paramètres et de l'horodatage, puis insertion en lot dans `analytics_events`.
 */
@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async ingest(
    dto: PostEventsDto,
    ctx: EventContext,
    now = new Date(),
  ): Promise<PostEventsResultDto> {
    const rows: Prisma.AnalyticsEventCreateManyInput[] = dto.events.map((e, index) => ({
      userId: ctx.userId ?? null,
      sessionId: dto.sessionId ?? null,
      name: e.name,
      params: AnalyticsService.validateParams(e, index),
      country: ctx.country ?? null,
      appVersion: dto.appVersion ?? null,
      occurredAt: AnalyticsService.occurredAt(e.at, now),
      receivedAt: now,
    }));
    const result = await this.prisma.analyticsEvent.createMany({ data: rows });
    return { accepted: result.count };
  }

  static validateParams(e: AnalyticsEventInputDto, index: number): Prisma.InputJsonObject {
    const params = (e.params ?? {}) as Prisma.InputJsonObject;
    const size = Buffer.byteLength(JSON.stringify(params), 'utf8');
    if (size > ANALYTICS_PARAMS_MAX_BYTES) {
      throw new BadRequestException({
        code: 'EVENT_PARAMS_TOO_LARGE',
        message: `events[${index}].params exceeds ${ANALYTICS_PARAMS_MAX_BYTES} bytes`,
        details: { index, size, max: ANALYTICS_PARAMS_MAX_BYTES },
      });
    }
    return params;
  }

  /** Horodatage appareil borné à ±7 jours autour de la réception (horloges fausses). */
  static occurredAt(at: string, now: Date): Date {
    const ts = new Date(at);
    if (Number.isNaN(ts.getTime())) return now;
    const skew = Math.abs(ts.getTime() - now.getTime());
    return skew > MAX_CLOCK_SKEW_MS ? now : ts;
  }
}
