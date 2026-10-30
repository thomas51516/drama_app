import { HttpException, HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuditService } from '../admin/audit/audit.service.js';
import { type AuthenticatedAdmin } from '../common/request-context.js';
import { AppConfig } from '../config/app-config.js';
import { type Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { supportReplyTexts } from '../push/notification-texts.js';
import { PushService } from '../push/push.service.js';
import { RedisService } from '../redis/redis.service.js';
import {
  type ContactDto,
  type ContactResultDto,
  type ReplyTicketDto,
  type TicketDto,
  type TicketListDto,
  type TicketListQueryDto,
} from './dto/help.dto.js';

const ticketInclude = {
  messages: { orderBy: { createdAt: 'asc' as const } },
  user: { select: { displayName: true, email: true, phone: true, language: true } },
} satisfies Prisma.SupportTicketInclude;
type TicketRow = Prisma.SupportTicketGetPayload<{ include: typeof ticketInclude }>;

/** Clé Redis de la limite « 5 demandes par jour et par utilisateur » (jour UTC, préfixe `rl:`). */
export function contactLimitKey(userId: string, now = new Date()): string {
  return `rl:help_contact:user:${userId}:${now.toISOString().slice(0, 10).replace(/-/g, '')}`;
}

/**
 * Formulaire de contact et boîte de réception du support (M-53, S06-BE-02, contrat v1.3).
 * Une réponse du support crée une notification in-app `support_reply` (+ push si appareil).
 */
@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: AppConfig,
    private readonly audit: AuditService,
    private readonly push: PushService,
  ) {}

  // ---------------------------------------------------------------- utilisateur

  async contact(userId: string, dto: ContactDto, now = new Date()): Promise<ContactResultDto> {
    await this.enforceDailyLimit(userId, now);
    const ticket = await this.prisma.supportTicket.create({
      data: {
        userId,
        category: dto.category,
        subject: dto.subject.trim(),
        email: dto.email?.trim().toLowerCase() ?? null,
        messages: { create: { author: 'USER', body: dto.message.trim() } },
      },
    });
    if (ticket.email) {
      // Pas de service d'e-mail transactionnel au MVP : la confirmation est journalisée (console).
      this.logger.log(
        `[MAIL] [console] to ${ticket.email}: confirmation de la demande ${ticket.id} « ${ticket.subject} »`,
      );
    }
    return { ticketId: ticket.id };
  }

  async listMine(userId: string, query: TicketListQueryDto): Promise<TicketListDto> {
    const where: Prisma.SupportTicketWhereInput = { userId };
    if (query.status) where.status = query.status;
    return this.page(where, query);
  }

  // ------------------------------------------------------------------- support

  async list(query: TicketListQueryDto): Promise<TicketListDto> {
    const where: Prisma.SupportTicketWhereInput = query.status ? { status: query.status } : {};
    return this.page(where, query);
  }

  async get(id: string): Promise<TicketDto> {
    return toTicketDto(await this.findOrThrow(id));
  }

  async reply(id: string, dto: ReplyTicketDto, admin: AuthenticatedAdmin, ip?: string) {
    const before = await this.findOrThrow(id);
    const body = dto.message.trim();
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.supportMessage.create({
        data: { ticketId: id, author: 'SUPPORT', adminId: admin.id, body },
      });
      const ticket = await tx.supportTicket.update({
        where: { id },
        data: { status: before.status === 'CLOSED' ? 'CLOSED' : 'ANSWERED' },
        include: ticketInclude,
      });
      await this.audit.record(
        {
          actor: admin,
          action: 'support_ticket.reply',
          targetType: 'support_ticket',
          targetId: id,
          oldValue: { status: before.status },
          newValue: { status: ticket.status, messageLength: body.length },
          ip,
        },
        tx,
      );
      return ticket;
    });
    try {
      await this.push.notify({
        userId: updated.userId,
        type: 'support_reply',
        ...supportReplyTexts(updated.user.language, body),
        data: { ticketId: id },
      });
    } catch (err) {
      this.logger.warn(`Support reply notification failed: ${(err as Error).message}`);
    }
    return toTicketDto(updated);
  }

  async close(id: string, admin: AuthenticatedAdmin, ip?: string): Promise<TicketDto> {
    const before = await this.findOrThrow(id);
    if (before.status === 'CLOSED') return toTicketDto(before);
    const updated = await this.prisma.$transaction(async (tx) => {
      const ticket = await tx.supportTicket.update({
        where: { id },
        data: { status: 'CLOSED' },
        include: ticketInclude,
      });
      await this.audit.record(
        {
          actor: admin,
          action: 'support_ticket.close',
          targetType: 'support_ticket',
          targetId: id,
          oldValue: { status: before.status },
          newValue: { status: 'CLOSED' },
          ip,
        },
        tx,
      );
      return ticket;
    });
    return toTicketDto(updated);
  }

  // ------------------------------------------------------------------- interne

  private async page(where: Prisma.SupportTicketWhereInput, query: TicketListQueryDto) {
    const [rows, total] = await Promise.all([
      this.prisma.supportTicket.findMany({
        where,
        include: ticketInclude,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.supportTicket.count({ where }),
    ]);
    return { items: rows.map(toTicketDto), total, page: query.page, pageSize: query.pageSize };
  }

  /** Fenêtre fixe d'un jour UTC ; fail-open sans Redis. 429 `RATE_LIMITED` au-delà de la limite. */
  private async enforceDailyLimit(userId: string, now: Date): Promise<void> {
    const limit = this.config.support.contactDailyLimit;
    let count: number;
    try {
      const key = contactLimitKey(userId, now);
      count = await this.redis.client.incr(key);
      if (count === 1) await this.redis.client.expire(key, 86_400);
    } catch (err) {
      this.logger.warn(`Contact limit skipped (Redis unavailable): ${(err as Error).message}`);
      return;
    }
    if (count > limit) {
      throw new HttpException(
        {
          code: 'RATE_LIMITED',
          message: `Too many support requests, limit is ${limit} per day`,
          details: { rule: 'help_contact', limit, retryAfterSeconds: 86_400 },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async findOrThrow(id: string): Promise<TicketRow> {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id },
      include: ticketInclude,
    });
    if (!ticket) {
      throw new NotFoundException({ code: 'TICKET_NOT_FOUND', message: 'Ticket not found' });
    }
    return ticket;
  }
}

export function toTicketDto(t: TicketRow): TicketDto {
  return {
    id: t.id,
    userId: t.userId,
    userLabel:
      t.user.displayName?.trim() || t.user.email || t.user.phone || `Invité ${t.userId.slice(-8)}`,
    category: t.category,
    subject: t.subject,
    email: t.email,
    status: t.status,
    messages: t.messages.map((m) => ({
      from: m.author === 'SUPPORT' ? ('support' as const) : ('user' as const),
      body: m.body,
      at: m.createdAt.toISOString(),
    })),
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}
