import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthService, toUserDto, vipStatusOf } from '../../auth/auth.service.js';
import { type UserDto } from '../../auth/dto/user.dto.js';
import { BillingService } from '../../billing/billing.service.js';
import { type AuthenticatedAdmin } from '../../common/request-context.js';
import { Prisma, type User, type Wallet } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { type UnlockMethodLabel } from '../../unlock/dto/unlock.dto.js';
import { type WalletDto } from '../../wallet/dto/wallet.dto.js';
import { WalletService } from '../../wallet/wallet.service.js';
import { AuditService } from '../audit/audit.service.js';
import {
  type AdjustCoinsDto,
  type AdminUserDetailDto,
  type AdminUserListDto,
  type AdminUserSummaryDto,
  type ListAdminUsersQueryDto,
} from './dto/admin-user.dto.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const withIdentities = { identities: { select: { provider: true } } } as const;

/**
 * Utilisateurs et support (B-09, contrat v1.4) : recherche, fiche agrégée, crédit / débit manuel
 * (ligne ADJUSTMENT avec motif obligatoire, audit), blocage (jetons révoqués) et déblocage.
 */
@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly billing: BillingService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListAdminUsersQueryDto): Promise<AdminUserListDto> {
    const q = query.q?.trim();
    const where: Prisma.UserWhereInput = {};
    if (q) {
      if (UUID_RE.test(q)) {
        where.id = q.toLowerCase();
      } else {
        where.OR = [
          { email: { contains: q, mode: 'insensitive' } },
          { phone: { contains: q } },
          { displayName: { contains: q, mode: 'insensitive' } },
        ];
      }
    }
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: { wallet: true },
        orderBy: [{ lastSeenAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items: rows.map(toSummary), total, page: query.page, pageSize: query.pageSize };
  }

  async detail(id: string): Promise<AdminUserDetailDto> {
    const user = await this.prisma.user.findUnique({ where: { id }, include: withIdentities });
    if (!user) throw userNotFound();
    const [wallet, subscription, unlocks, purchases, recentLedger, devices] = await Promise.all([
      this.wallet.getWallet(id),
      this.billing.getSubscription(id),
      this.prisma.unlock.findMany({
        where: { userId: id },
        include: {
          episode: {
            select: { number: true, seriesId: true, series: { select: { title: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.purchase.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.wallet.recentEntries(id, 20),
      this.prisma.pushDevice.count({ where: { userId: id } }),
    ]);
    return {
      user: toUserDto(user),
      wallet,
      subscription,
      unlocks: unlocks.map((u) => ({
        episodeId: u.episodeId,
        seriesId: u.episode.seriesId,
        seriesTitle: u.episode.series.title,
        episodeNumber: u.episode.number,
        method: u.method.toLowerCase() as UnlockMethodLabel,
        at: u.createdAt.toISOString(),
      })),
      purchases: purchases.map((p) => ({
        id: p.id,
        productId: p.productId,
        status: p.status,
        coins: p.coins,
        bonusCoins: p.bonusCoins,
        orderId: p.orderId,
        createdAt: p.createdAt.toISOString(),
        creditedAt: p.creditedAt?.toISOString() ?? null,
      })),
      recentLedger,
      devices,
      lastSeenAt: user.lastSeenAt?.toISOString() ?? null,
    };
  }

  async adjustCoins(
    id: string,
    dto: AdjustCoinsDto,
    admin: AuthenticatedAdmin,
    ip?: string,
  ): Promise<WalletDto> {
    const user = await this.prisma.user.findUnique({ where: { id }, select: { status: true } });
    if (!user) throw userNotFound();
    return this.wallet.adjust(id, dto, admin, ip);
  }

  async block(
    id: string,
    reason: string,
    admin: AuthenticatedAdmin,
    ip?: string,
  ): Promise<UserDto> {
    const user = await this.prisma.user.findUnique({ where: { id }, include: withIdentities });
    if (!user) throw userNotFound();
    if (user.status === 'BLOCKED') return toUserDto(user);
    if (user.status === 'MERGED' || user.status === 'DELETED') {
      throw new ConflictException({
        code: 'USER_NOT_ACTIVE',
        message: 'Account cannot be blocked',
      });
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.user.update({
        where: { id },
        data: { status: 'BLOCKED' },
        include: withIdentities,
      });
      await AuthService.revokeAllTokens(tx, id);
      await this.audit.record(
        {
          actor: admin,
          action: 'user.block',
          targetType: 'user',
          targetId: id,
          oldValue: { status: user.status },
          newValue: { status: 'BLOCKED', reason },
          ip,
        },
        tx,
      );
      return row;
    });
    return toUserDto(updated);
  }

  async unblock(
    id: string,
    reason: string,
    admin: AuthenticatedAdmin,
    ip?: string,
  ): Promise<UserDto> {
    const user = await this.prisma.user.findUnique({ where: { id }, include: withIdentities });
    if (!user) throw userNotFound();
    if (user.status !== 'BLOCKED') {
      throw new ConflictException({ code: 'USER_NOT_BLOCKED', message: 'Account is not blocked' });
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.user.update({
        where: { id },
        data: { status: 'ACTIVE' },
        include: withIdentities,
      });
      await this.audit.record(
        {
          actor: admin,
          action: 'user.unblock',
          targetType: 'user',
          targetId: id,
          oldValue: { status: 'BLOCKED' },
          newValue: { status: 'ACTIVE', reason },
          ip,
        },
        tx,
      );
      return row;
    });
    return toUserDto(updated);
  }
}

function userNotFound(): NotFoundException {
  return new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found' });
}

function toSummary(u: User & { wallet: Wallet | null }): AdminUserSummaryDto {
  const purchased = u.wallet?.purchasedBalance ?? 0;
  const bonus = u.wallet?.bonusBalance ?? 0;
  return {
    id: u.id,
    type: u.type,
    status: u.status,
    displayName: u.displayName,
    email: u.email,
    phone: u.phone,
    country: u.country,
    vipStatus: vipStatusOf(u),
    vipExpiresAt: u.vipExpiresAt?.toISOString() ?? null,
    balance: { purchased, bonus, total: purchased + bonus },
    createdAt: u.createdAt.toISOString(),
    lastSeenAt: u.lastSeenAt?.toISOString() ?? null,
  };
}
