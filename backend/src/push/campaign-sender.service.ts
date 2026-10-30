import { Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../config/app-config.js';
import { type Campaign, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PushService } from './push.service.js';
import { type PushMessage } from './push.types.js';

type Segment = Pick<Campaign, 'segmentType' | 'countries' | 'seriesId' | 'inactiveDays'>;

/**
 * Ciblage et envoi par lots des campagnes (B-10). Audience = utilisateurs actifs ayant au moins
 * un appareil, préférence `offers` non désactivée, filtrés par segment :
 * ALL, COUNTRY (pays du compte), SERIES_FOLLOWERS (favoris), INACTIVE (ni session ni lecture
 * depuis N jours). Lots de `PUSH_BATCH_SIZE` (500) utilisateurs, plafond quotidien respecté.
 */
@Injectable()
export class CampaignSenderService {
  private readonly logger = new Logger(CampaignSenderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly push: PushService,
  ) {}

  /** Prédicat SQL du segment (sur l'alias `u` de `users`). */
  static segmentSql(segment: Segment, now = new Date()): Prisma.Sql {
    const base = Prisma.sql`u.status = 'ACTIVE'
      AND COALESCE((u.notification_preferences->>'offers')::boolean, true)
      AND EXISTS (SELECT 1 FROM push_devices d WHERE d.user_id = u.id)`;
    switch (segment.segmentType) {
      case 'COUNTRY':
        return Prisma.sql`${base} AND u.country::text = ANY(${segment.countries}::text[])`;
      case 'SERIES_FOLLOWERS':
        return Prisma.sql`${base} AND EXISTS (
          SELECT 1 FROM favorites f WHERE f.user_id = u.id AND f.series_id = ${segment.seriesId}::uuid)`;
      case 'INACTIVE': {
        const threshold = new Date(now.getTime() - (segment.inactiveDays ?? 7) * 86_400_000);
        return Prisma.sql`${base} AND COALESCE(
          GREATEST(u.last_seen_at, (SELECT MAX(wp.updated_at) FROM watch_progress wp WHERE wp.user_id = u.id)),
          u.created_at) < ${threshold}`;
      }
      default:
        return base;
    }
  }

  async estimate(segment: Segment, now = new Date()): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM users u WHERE ${CampaignSenderService.segmentSql(segment, now)}`;
    return rows[0]?.count ?? 0;
  }

  /** Page d'audience triée par identifiant (curseur), avec langue pour d'éventuelles variantes. */
  async audiencePage(segment: Segment, after: string | null, limit: number, now = new Date()) {
    const cursor = after ? Prisma.sql`AND u.id > ${after}::uuid` : Prisma.empty;
    return this.prisma.$queryRaw<{ id: string }[]>`
      SELECT u.id FROM users u
      WHERE ${CampaignSenderService.segmentSql(segment, now)} ${cursor}
      ORDER BY u.id LIMIT ${limit}`;
  }

  /**
   * Envoi complet d'une campagne SENDING : lots successifs, arrêt si elle est annulée entre deux
   * lots, compteurs mis à jour, statut final SENT.
   */
  async run(campaignId: string, now = new Date()): Promise<Campaign | null> {
    const campaign = await this.prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign || campaign.status !== 'SENDING') return campaign;
    const batchSize = this.config.push.batchSize;
    let after: string | null = null;
    let sentUsers = 0;
    let audience = 0;
    for (;;) {
      const current = await this.prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { status: true },
      });
      if (current?.status !== 'SENDING') {
        this.logger.log(`Campaign ${campaignId} stopped (${current?.status ?? 'deleted'})`);
        return this.prisma.campaign.findUnique({ where: { id: campaignId } });
      }
      const page = await this.audiencePage(campaign, after, batchSize, now);
      if (page.length === 0) break;
      audience += page.length;
      sentUsers += await this.sendBatch(
        campaign,
        page.map((p) => p.id),
        now,
      );
      await this.prisma.campaign.update({
        where: { id: campaignId },
        data: { sentCount: sentUsers, audienceCount: audience },
      });
      after = page[page.length - 1].id;
      if (page.length < batchSize) break;
    }
    const done = await this.prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'SENT', sentCount: sentUsers, audienceCount: audience, sentAt: new Date() },
    });
    this.logger.log(`Campaign ${campaignId} sent to ${sentUsers}/${audience} user(s)`);
    return done;
  }

  /** Un lot : historique in-app pour tous, push pour ceux sous le plafond ; renvoie les utilisateurs notifiés. */
  async sendBatch(campaign: Campaign, userIds: string[], now = new Date()): Promise<number> {
    if (userIds.length === 0) return 0;
    const data: Record<string, string> = { type: 'campaign', campaignId: campaign.id };
    if (campaign.deepLink) data.deepLink = campaign.deepLink;
    const notifications = await this.prisma.notification.createManyAndReturn({
      data: userIds.map((userId) => ({
        userId,
        type: 'campaign',
        title: campaign.title,
        body: campaign.body,
        data,
        campaignId: campaign.id,
        sentAt: now,
      })),
      select: { id: true, userId: true },
    });
    const notificationByUser = new Map(notifications.map((n) => [n.userId, n.id]));
    const allowed = await this.push.consumeDailyCap(userIds, now);
    const devices = await this.prisma.pushDevice.findMany({
      where: { userId: { in: [...allowed] } },
      select: { userId: true, token: true },
    });
    const capped = userIds.filter((id) => !allowed.has(id));
    if (capped.length > 0) {
      await this.prisma.pushDelivery.createMany({
        data: capped.map((userId) => ({
          notificationId: notificationByUser.get(userId) ?? null,
          userId,
          campaignId: campaign.id,
          provider: this.push.provider.name,
          status: 'SKIPPED' as const,
          error: 'daily_cap',
        })),
      });
    }
    const messages: PushMessage[] = devices.map((d) => ({
      token: d.token,
      title: campaign.title,
      body: campaign.body,
      data: { ...data, notificationId: notificationByUser.get(d.userId) ?? '' },
    }));
    const results = await this.push.deliver(messages);
    const userByToken = new Map(devices.map((d) => [d.token, d.userId]));
    await this.push.recordDeliveries(
      results.map((result) => {
        const userId = userByToken.get(result.token) ?? null;
        return {
          notificationId: userId ? (notificationByUser.get(userId) ?? null) : null,
          userId,
          campaignId: campaign.id,
          result,
        };
      }),
    );
    return new Set(results.filter((r) => r.ok).map((r) => userByToken.get(r.token))).size;
  }
}
