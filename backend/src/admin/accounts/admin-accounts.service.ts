import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import argon2 from 'argon2';
import { type AuthenticatedAdmin } from '../../common/request-context.js';
import { type AdminAccount, type Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService, diffChanges } from '../audit/audit.service.js';
import {
  type AdminAccountDto,
  type AuditLogDto,
  type AuditLogListDto,
  type CreateAdminAccountDto,
  type ListAuditLogsQueryDto,
  type ResetAdminPasswordDto,
  type UpdateAdminAccountDto,
} from './dto/admin-account.dto.js';

const AUDITED_FIELDS = ['displayName', 'role', 'isActive'] as const;

/**
 * Comptes internes et journal d'audit (B-13, contrat admin v1.1). Rôle ADMIN uniquement.
 * Garde-fous : un admin ne peut ni se désactiver ni se retirer le rôle ADMIN, et le dernier
 * compte ADMIN actif ne peut être ni désactivé ni rétrogradé.
 */
@Injectable()
export class AdminAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<AdminAccountDto[]> {
    const accounts = await this.prisma.adminAccount.findMany({ orderBy: { createdAt: 'asc' } });
    return accounts.map(toAccountDto);
  }

  async create(dto: CreateAdminAccountDto, admin: AuthenticatedAdmin, ip?: string) {
    const existing = await this.prisma.adminAccount.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException({
        code: 'ADMIN_EMAIL_TAKEN',
        message: 'An account with this e-mail already exists',
      });
    }
    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });
    const created = await this.prisma.$transaction(async (tx) => {
      const account = await tx.adminAccount.create({
        data: { email: dto.email, displayName: dto.displayName, role: dto.role, passwordHash },
      });
      await this.audit.record(
        {
          actor: admin,
          action: 'admin_account.create',
          targetType: 'admin_account',
          targetId: account.id,
          newValue: { email: account.email, displayName: account.displayName, role: account.role },
          ip,
        },
        tx,
      );
      return account;
    });
    return toAccountDto(created);
  }

  async update(id: string, dto: UpdateAdminAccountDto, admin: AuthenticatedAdmin, ip?: string) {
    const before = await this.findOrThrow(id);
    const data: Prisma.AdminAccountUpdateInput = {};
    if (dto.displayName !== undefined) data.displayName = dto.displayName;
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (Object.keys(data).length === 0) return toAccountDto(before);

    const losesAdmin =
      before.role === 'ADMIN' &&
      before.isActive &&
      ((dto.role !== undefined && dto.role !== 'ADMIN') || dto.isActive === false);
    if (losesAdmin && before.id === admin.id) {
      throw new ForbiddenException({
        code: 'ADMIN_SELF_LOCKOUT',
        message: 'You cannot deactivate yourself or drop your own ADMIN role',
      });
    }
    if (losesAdmin) await this.assertAnotherActiveAdmin(before.id);

    const updated = await this.prisma.$transaction(async (tx) => {
      const account = await tx.adminAccount.update({ where: { id }, data });
      const diff = diffChanges(before, account, AUDITED_FIELDS);
      if (diff.changed.length > 0) {
        await this.audit.record(
          {
            actor: admin,
            action: 'admin_account.update',
            targetType: 'admin_account',
            targetId: id,
            oldValue: diff.oldValue,
            newValue: diff.newValue,
            ip,
          },
          tx,
        );
      }
      return account;
    });
    return toAccountDto(updated);
  }

  /** Efface le secret et l'enrôlement : la prochaine connexion renvoie `totp_setup_required`. */
  async resetTotp(id: string, admin: AuthenticatedAdmin, ip?: string): Promise<AdminAccountDto> {
    const before = await this.findOrThrow(id);
    const updated = await this.prisma.$transaction(async (tx) => {
      const account = await tx.adminAccount.update({
        where: { id },
        data: { totpSecret: null, totpEnabledAt: null },
      });
      await this.audit.record(
        {
          actor: admin,
          action: 'admin_account.reset_totp',
          targetType: 'admin_account',
          targetId: id,
          oldValue: { totpEnrolled: before.totpEnabledAt !== null },
          newValue: { totpEnrolled: false },
          ip,
        },
        tx,
      );
      return account;
    });
    return toAccountDto(updated);
  }

  async resetPassword(
    id: string,
    dto: ResetAdminPasswordDto,
    admin: AuthenticatedAdmin,
    ip?: string,
  ): Promise<void> {
    await this.findOrThrow(id);
    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });
    await this.prisma.$transaction(async (tx) => {
      await tx.adminAccount.update({ where: { id }, data: { passwordHash } });
      await this.audit.record(
        {
          actor: admin,
          action: 'admin_account.reset_password',
          targetType: 'admin_account',
          targetId: id,
          ip,
        },
        tx,
      );
    });
  }

  // ------------------------------------------------------------ journal d'audit

  async listAuditLogs(query: ListAuditLogsQueryDto): Promise<AuditLogListDto> {
    const where: Prisma.AuditLogWhereInput = {};
    if (query.actorId) where.actorId = query.actorId;
    if (query.action) {
      where.action = query.action.endsWith('.') ? { startsWith: query.action } : query.action;
    }
    if (query.targetType) where.targetType = query.targetType;
    if (query.targetId) where.targetId = query.targetId;
    if (query.from || query.to) {
      where.createdAt = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    }
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return {
      items: items.map(toAuditLogDto),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  // ------------------------------------------------------------------ interne

  private async assertAnotherActiveAdmin(excludeId: string): Promise<void> {
    const others = await this.prisma.adminAccount.count({
      where: { role: 'ADMIN', isActive: true, id: { not: excludeId } },
    });
    if (others === 0) {
      throw new ConflictException({
        code: 'LAST_ADMIN',
        message: 'At least one active ADMIN account must remain',
      });
    }
  }

  private async findOrThrow(id: string): Promise<AdminAccount> {
    const account = await this.prisma.adminAccount.findUnique({ where: { id } });
    if (!account) {
      throw new NotFoundException({
        code: 'ADMIN_ACCOUNT_NOT_FOUND',
        message: 'Account not found',
      });
    }
    return account;
  }
}

export function toAccountDto(a: AdminAccount): AdminAccountDto {
  return {
    id: a.id,
    email: a.email,
    displayName: a.displayName,
    role: a.role,
    isActive: a.isActive,
    totpEnrolled: a.totpEnabledAt !== null && a.totpSecret !== null,
    lastLoginAt: a.lastLoginAt?.toISOString() ?? null,
    createdAt: a.createdAt.toISOString(),
  };
}

export function toAuditLogDto(log: {
  id: string;
  actorId: string | null;
  actorLabel: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  oldValue: unknown;
  newValue: unknown;
  ipAddress: string | null;
  createdAt: Date;
}): AuditLogDto {
  return {
    id: log.id,
    actorId: log.actorId,
    actorEmail: log.actorLabel,
    action: log.action,
    targetType: log.targetType,
    targetId: log.targetId,
    oldValue: log.oldValue ?? null,
    newValue: log.newValue ?? null,
    ip: log.ipAddress,
    createdAt: log.createdAt.toISOString(),
  };
}
