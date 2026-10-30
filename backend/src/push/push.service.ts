import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AppConfig } from '../config/app-config.js';
import { type Notification, type Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';
import {
  type NotificationDto,
  type NotificationsPageDto,
  type NotificationsQueryDto,
  type RegisterPushDeviceDto,
} from './dto/push.dto.js';
import {
  PUSH_PROVIDER,
  type NotificationType,
  type PushMessage,
  type PushProvider,
  type PushResult,
} from './push.types.js';

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, string>;
  campaignId?: string;
}

export interface NotifyOutcome {
  notificationId: string;
  /** Appareils effectivement notifiés (0 si aucun appareil, plafond atteint ou échec). */
  pushed: number;
  skipped?: 'no_device' | 'daily_cap';
}

/** Clé Redis du plafond quotidien (jour UTC), toutes causes confondues (§13 : 2 par jour). */
export function dailyCapKey(userId: string, now = new Date()): string {
  return `push:cap:${userId}:${now.toISOString().slice(0, 10).replace(/-/g, '')}`;
}

/**
 * Notifications (M-54, S06-BE-01) : appareils FCM, historique in-app et envoi unitaire avec
 * plafond quotidien par utilisateur. L'envoi en masse des campagnes est dans `CampaignSenderService`.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: AppConfig,
    @Inject(PUSH_PROVIDER) readonly provider: PushProvider,
  ) {}

  // ------------------------------------------------------------------ appareils

  /** Upsert par jeton : un appareil qui change de compte est rattaché à l'utilisateur courant. */
  async registerDevice(userId: string, dto: RegisterPushDeviceDto): Promise<void> {
    const now = new Date();
    await this.prisma.pushDevice.upsert({
      where: { token: dto.token },
      create: {
        userId,
        token: dto.token,
        platform: dto.platform,
        locale: dto.locale ?? null,
        appVersion: dto.appVersion ?? null,
        lastSeenAt: now,
      },
      update: {
        userId,
        platform: dto.platform,
        locale: dto.locale ?? null,
        appVersion: dto.appVersion ?? null,
        lastSeenAt: now,
      },
    });
  }

  /** Idempotent ; ne supprime que les jetons de l'utilisateur courant. */
  async removeDevice(userId: string, token: string): Promise<void> {
    await this.prisma.pushDevice.deleteMany({ where: { userId, token } });
  }

  // -------------------------------------------------------------- historique in-app

  async listNotifications(
    userId: string,
    query: NotificationsQueryDto,
  ): Promise<NotificationsPageDto> {
    const where: Prisma.NotificationWhereInput = { userId };
    const [items, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: [{ sentAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return {
      items: items.map(toNotificationDto),
      total,
      page: query.page,
      pageSize: query.pageSize,
      unreadCount,
    };
  }

  async markRead(userId: string, id: string): Promise<void> {
    const result = await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
    if (result.count === 0) {
      const exists = await this.prisma.notification.findFirst({ where: { id, userId } });
      if (!exists) {
        throw new NotFoundException({
          code: 'NOTIFICATION_NOT_FOUND',
          message: 'Notification not found',
        });
      }
    }
  }

  // ------------------------------------------------------------------- envoi

  /**
   * Historique in-app + push sur tous les appareils de l'utilisateur, dans la limite du plafond
   * quotidien (`PUSH_DAILY_CAP`). Le plafond n'est consommé que si l'utilisateur a un appareil.
   */
  async notify(input: NotifyInput, now = new Date()): Promise<NotifyOutcome> {
    const notification = await this.prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title.slice(0, 200),
        body: input.body.slice(0, 1000),
        data: input.data ?? undefined,
        campaignId: input.campaignId ?? null,
        sentAt: now,
      },
    });
    const devices = await this.prisma.pushDevice.findMany({
      where: { userId: input.userId },
      select: { token: true },
    });
    if (devices.length === 0) {
      return { notificationId: notification.id, pushed: 0, skipped: 'no_device' };
    }
    const allowed = await this.consumeDailyCap([input.userId], now);
    if (!allowed.has(input.userId)) {
      await this.prisma.pushDelivery.create({
        data: {
          notificationId: notification.id,
          userId: input.userId,
          campaignId: input.campaignId ?? null,
          provider: this.provider.name,
          status: 'SKIPPED',
          error: 'daily_cap',
        },
      });
      return { notificationId: notification.id, pushed: 0, skipped: 'daily_cap' };
    }
    const messages: PushMessage[] = devices.map((d) => ({
      token: d.token,
      title: notification.title,
      body: notification.body,
      data: { type: input.type, notificationId: notification.id, ...(input.data ?? {}) },
    }));
    const results = await this.deliver(messages);
    await this.recordDeliveries(
      results.map((r) => ({
        notificationId: notification.id,
        userId: input.userId,
        campaignId: input.campaignId ?? null,
        result: r,
      })),
    );
    return { notificationId: notification.id, pushed: results.filter((r) => r.ok).length };
  }

  /** Envoi tolérant : une panne du fournisseur devient une remise FAILED, jamais une exception. */
  async deliver(messages: PushMessage[]): Promise<PushResult[]> {
    if (messages.length === 0) return [];
    try {
      return await this.provider.send(messages);
    } catch (err) {
      const error = (err as Error).message.slice(0, 500);
      this.logger.error(`Push provider ${this.provider.name} failed: ${error}`);
      return messages.map((m) => ({ token: m.token, ok: false, error }));
    }
  }

  /** Journal `push_deliveries` + suppression des jetons que le fournisseur déclare invalides. */
  async recordDeliveries(
    rows: {
      notificationId: string | null;
      userId: string | null;
      campaignId: string | null;
      result: PushResult;
    }[],
  ): Promise<void> {
    if (rows.length === 0) return;
    await this.prisma.pushDelivery.createMany({
      data: rows.map((r) => ({
        notificationId: r.notificationId,
        userId: r.userId,
        campaignId: r.campaignId,
        token: r.result.token.slice(0, 512),
        provider: this.provider.name,
        status: r.result.ok ? 'SENT' : 'FAILED',
        providerMessageId: r.result.messageId?.slice(0, 200) ?? null,
        error: r.result.error?.slice(0, 500) ?? null,
      })),
    });
    const invalid = rows.filter((r) => r.result.invalidToken).map((r) => r.result.token);
    if (invalid.length > 0) {
      await this.prisma.pushDevice.deleteMany({ where: { token: { in: invalid } } });
      this.logger.log(`Removed ${invalid.length} invalid push token(s)`);
    }
  }

  /**
   * Incrémente le compteur du jour de chaque utilisateur et renvoie ceux encore sous le plafond.
   * Sans Redis : tout le monde passe (fail-open, journalisé).
   */
  async consumeDailyCap(userIds: string[], now = new Date()): Promise<Set<string>> {
    if (userIds.length === 0) return new Set();
    const cap = this.config.push.dailyCap;
    try {
      const pipeline = this.redis.client.multi();
      for (const id of userIds)
        pipeline.incr(dailyCapKey(id, now)).expire(dailyCapKey(id, now), 2 * 86_400);
      const results = (await pipeline.exec()) ?? [];
      const allowed = new Set<string>();
      userIds.forEach((id, i) => {
        const count = Number(results[i * 2]?.[1] ?? 0);
        if (count <= cap) allowed.add(id);
      });
      return allowed;
    } catch (err) {
      this.logger.warn(`Daily cap check skipped (Redis unavailable): ${(err as Error).message}`);
      return new Set(userIds);
    }
  }
}

export function toNotificationDto(n: Notification): NotificationDto {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    data: (n.data as Record<string, unknown> | null) ?? null,
    sentAt: n.sentAt.toISOString(),
    readAt: n.readAt?.toISOString() ?? null,
  };
}
