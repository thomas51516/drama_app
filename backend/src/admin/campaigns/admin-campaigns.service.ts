import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { type AuthenticatedAdmin } from '../../common/request-context.js';
import { type Campaign, type Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CampaignSenderService } from '../../push/campaign-sender.service.js';
import { PushQueue } from '../../push/push.queue.js';
import { AuditService, diffChanges } from '../audit/audit.service.js';
import {
  type CampaignDto,
  type CampaignListDto,
  type CampaignSegmentDto,
  type CreateCampaignDto,
  type ListCampaignsQueryDto,
  type UpdateCampaignDto,
} from './dto/campaign.dto.js';

const AUDITED_FIELDS = [
  'title',
  'body',
  'deepLink',
  'segmentType',
  'countries',
  'seriesId',
  'inactiveDays',
  'scheduledAt',
  'status',
] as const;

/**
 * Campagnes push ciblées (B-10, contrat v1.3). Rôles MONETIZATION et ADMIN.
 * Cycle : DRAFT → (send) SENDING | SCHEDULED → SENDING (tick du planificateur) → SENT ; CANCELLED
 * depuis DRAFT, SCHEDULED ou SENDING (l'envoi s'arrête au lot suivant).
 */
@Injectable()
export class AdminCampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sender: CampaignSenderService,
    private readonly queue: PushQueue,
  ) {}

  async list(query: ListCampaignsQueryDto): Promise<CampaignListDto> {
    const where: Prisma.CampaignWhereInput = query.status ? { status: query.status } : {};
    const [items, total] = await Promise.all([
      this.prisma.campaign.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.campaign.count({ where }),
    ]);
    return { items: items.map(toCampaignDto), total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string): Promise<CampaignDto> {
    return toCampaignDto(await this.findOrThrow(id));
  }

  async create(dto: CreateCampaignDto, admin: AuthenticatedAdmin, ip?: string) {
    const segment = normalizeSegment(dto.segment);
    const audienceCount = await this.sender.estimate(segment);
    const created = await this.prisma.$transaction(async (tx) => {
      const campaign = await tx.campaign.create({
        data: {
          title: dto.title.trim(),
          body: dto.body.trim(),
          deepLink: dto.deepLink?.trim() ?? null,
          ...segment,
          scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
          audienceCount,
          createdById: admin.id,
          createdByLabel: admin.email,
        },
      });
      await this.audit.record(
        {
          actor: admin,
          action: 'campaign.create',
          targetType: 'campaign',
          targetId: campaign.id,
          newValue: pick(campaign),
          ip,
        },
        tx,
      );
      return campaign;
    });
    return toCampaignDto(created);
  }

  async update(id: string, dto: UpdateCampaignDto, admin: AuthenticatedAdmin, ip?: string) {
    const before = await this.findOrThrow(id);
    if (before.status !== 'DRAFT' && before.status !== 'SCHEDULED') {
      throw new ConflictException({
        code: 'CAMPAIGN_NOT_EDITABLE',
        message: `A ${before.status} campaign cannot be modified`,
      });
    }
    const data: Prisma.CampaignUncheckedUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.body !== undefined) data.body = dto.body.trim();
    if (dto.deepLink !== undefined) data.deepLink = dto.deepLink?.trim() ?? null;
    if (dto.scheduledAt !== undefined) {
      data.scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;
    }
    if (dto.segment !== undefined) Object.assign(data, normalizeSegment(dto.segment));
    const merged = { ...before, ...data } as Campaign;
    data.audienceCount = await this.sender.estimate(merged);

    const updated = await this.prisma.$transaction(async (tx) => {
      const campaign = await tx.campaign.update({ where: { id }, data });
      const diff = diffChanges(before, campaign, AUDITED_FIELDS);
      if (diff.changed.length > 0) {
        await this.audit.record(
          {
            actor: admin,
            action: 'campaign.update',
            targetType: 'campaign',
            targetId: id,
            oldValue: diff.oldValue,
            newValue: diff.newValue,
            ip,
          },
          tx,
        );
      }
      return campaign;
    });
    return toCampaignDto(updated);
  }

  async remove(id: string, admin: AuthenticatedAdmin, ip?: string): Promise<void> {
    const before = await this.findOrThrow(id);
    if (before.status !== 'DRAFT') {
      throw new ConflictException({
        code: 'CAMPAIGN_NOT_DRAFT',
        message: 'Only draft campaigns can be deleted',
      });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.campaign.delete({ where: { id } });
      await this.audit.record(
        {
          actor: admin,
          action: 'campaign.delete',
          targetType: 'campaign',
          targetId: id,
          oldValue: pick(before),
          ip,
        },
        tx,
      );
    });
  }

  async estimate(id: string): Promise<{ audienceCount: number }> {
    const campaign = await this.findOrThrow(id);
    const audienceCount = await this.sender.estimate(campaign);
    if (campaign.status === 'DRAFT' || campaign.status === 'SCHEDULED') {
      await this.prisma.campaign.update({ where: { id }, data: { audienceCount } });
    }
    return { audienceCount };
  }

  /** Envoi immédiat (file BullMQ `push`) ou programmation si `scheduledAt` est dans le futur. */
  async send(id: string, admin: AuthenticatedAdmin, ip?: string, now = new Date()) {
    const before = await this.findOrThrow(id);
    if (before.status !== 'DRAFT' && before.status !== 'SCHEDULED') {
      throw new ConflictException({
        code: 'CAMPAIGN_NOT_SENDABLE',
        message: `A ${before.status} campaign cannot be sent`,
      });
    }
    const scheduled = before.scheduledAt !== null && before.scheduledAt.getTime() > now.getTime();
    const status = scheduled ? 'SCHEDULED' : 'SENDING';
    const updated = await this.prisma.$transaction(async (tx) => {
      const campaign = await tx.campaign.update({ where: { id }, data: { status } });
      await this.audit.record(
        {
          actor: admin,
          action: scheduled ? 'campaign.schedule' : 'campaign.send',
          targetType: 'campaign',
          targetId: id,
          oldValue: { status: before.status },
          newValue: { status, scheduledAt: campaign.scheduledAt },
          ip,
        },
        tx,
      );
      return campaign;
    });
    if (!scheduled) await this.queue.dispatch(id);
    return toCampaignDto(await this.refresh(updated));
  }

  async cancel(id: string, admin: AuthenticatedAdmin, ip?: string): Promise<CampaignDto> {
    const before = await this.findOrThrow(id);
    if (before.status === 'CANCELLED') return toCampaignDto(before);
    if (before.status === 'SENT') {
      throw new ConflictException({
        code: 'CAMPAIGN_ALREADY_SENT',
        message: 'A sent campaign cannot be cancelled',
      });
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const campaign = await tx.campaign.update({ where: { id }, data: { status: 'CANCELLED' } });
      await this.audit.record(
        {
          actor: admin,
          action: 'campaign.cancel',
          targetType: 'campaign',
          targetId: id,
          oldValue: { status: before.status },
          newValue: { status: 'CANCELLED' },
          ip,
        },
        tx,
      );
      return campaign;
    });
    return toCampaignDto(updated);
  }

  /** Tick du planificateur : passe en SENDING et met en file les campagnes programmées échues. */
  async dispatchDue(now = new Date()): Promise<string[]> {
    const due = await this.prisma.campaign.findMany({
      where: { status: 'SCHEDULED', scheduledAt: { lte: now } },
      select: { id: true },
      orderBy: { scheduledAt: 'asc' },
      take: 20,
    });
    const dispatched: string[] = [];
    for (const { id } of due) {
      const claimed = await this.prisma.campaign.updateMany({
        where: { id, status: 'SCHEDULED' },
        data: { status: 'SENDING' },
      });
      if (claimed.count === 0) continue;
      await this.audit.record({
        actor: null,
        actorLabel: 'job:campaign-scheduler',
        action: 'campaign.send',
        targetType: 'campaign',
        targetId: id,
        oldValue: { status: 'SCHEDULED' },
        newValue: { status: 'SENDING' },
      });
      await this.queue.dispatch(id);
      dispatched.push(id);
    }
    return dispatched;
  }

  // ------------------------------------------------------------------ interne

  /** Après un envoi en ligne (file désactivée), la campagne a déjà pu passer en SENT. */
  private async refresh(campaign: Campaign): Promise<Campaign> {
    return (await this.prisma.campaign.findUnique({ where: { id: campaign.id } })) ?? campaign;
  }

  private async findOrThrow(id: string): Promise<Campaign> {
    const campaign = await this.prisma.campaign.findUnique({ where: { id } });
    if (!campaign) {
      throw new NotFoundException({ code: 'CAMPAIGN_NOT_FOUND', message: 'Campaign not found' });
    }
    return campaign;
  }
}

/** Valide la cohérence segment / paramètres et normalise les pays en majuscules. */
export function normalizeSegment(segment: CampaignSegmentDto) {
  const countries = (segment.countries ?? []).map((c) => c.toUpperCase());
  if (segment.type === 'COUNTRY' && countries.length === 0) {
    throw new BadRequestException({
      code: 'SEGMENT_INVALID',
      message: 'countries is required for a COUNTRY segment',
    });
  }
  if (segment.type === 'SERIES_FOLLOWERS' && !segment.seriesId) {
    throw new BadRequestException({
      code: 'SEGMENT_INVALID',
      message: 'seriesId is required for a SERIES_FOLLOWERS segment',
    });
  }
  if (segment.type === 'INACTIVE' && !segment.inactiveDays) {
    throw new BadRequestException({
      code: 'SEGMENT_INVALID',
      message: 'inactiveDays is required for an INACTIVE segment',
    });
  }
  return {
    segmentType: segment.type,
    countries: segment.type === 'COUNTRY' ? [...new Set(countries)] : [],
    seriesId: segment.type === 'SERIES_FOLLOWERS' ? (segment.seriesId ?? null) : null,
    inactiveDays: segment.type === 'INACTIVE' ? (segment.inactiveDays ?? null) : null,
  };
}

function pick(c: Campaign) {
  return {
    title: c.title,
    segmentType: c.segmentType,
    countries: c.countries,
    seriesId: c.seriesId,
    inactiveDays: c.inactiveDays,
    scheduledAt: c.scheduledAt,
    status: c.status,
  };
}

export function toCampaignDto(c: Campaign): CampaignDto {
  const segment: CampaignSegmentDto = { type: c.segmentType };
  if (c.segmentType === 'COUNTRY') segment.countries = c.countries;
  if (c.segmentType === 'SERIES_FOLLOWERS') segment.seriesId = c.seriesId ?? undefined;
  if (c.segmentType === 'INACTIVE') segment.inactiveDays = c.inactiveDays ?? undefined;
  return {
    id: c.id,
    title: c.title,
    body: c.body,
    deepLink: c.deepLink,
    segment,
    scheduledAt: c.scheduledAt?.toISOString() ?? null,
    status: c.status,
    audienceCount: c.audienceCount,
    sentCount: c.sentCount,
    createdBy: c.createdByLabel,
    sentAt: c.sentAt?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}
