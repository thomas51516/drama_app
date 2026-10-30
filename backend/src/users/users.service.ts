import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../admin/audit/audit.service.js';
import { AuthService, toUserDto } from '../auth/auth.service.js';
import { type UserDto } from '../auth/dto/user.dto.js';
import { AppConfig } from '../config/app-config.js';
import { type Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { type DeleteMeResultDto, type UpdateMeDto } from './dto/users.dto.js';

export const DELETED_DISPLAY_NAME = 'Utilisateur supprimé';

const withIdentities = { identities: { select: { provider: true } } } as const;

/** Compte utilisateur (S05-BE-04, M-52) : profil, préférences, suppression différée (§14). */
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly audit: AuditService,
  ) {}

  async getMe(userId: string): Promise<UserDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: withIdentities,
    });
    if (!user) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found' });
    return toUserDto(user);
  }

  async updateMe(userId: string, patch: UpdateMeDto): Promise<UserDto> {
    const current = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!current)
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found' });
    const data: Prisma.UserUpdateInput = {};
    if (patch.displayName !== undefined) data.displayName = patch.displayName.trim();
    if (patch.language !== undefined) data.language = patch.language;
    if (patch.country !== undefined) data.country = patch.country.toUpperCase();
    if (patch.autoUnlock !== undefined) data.autoUnlock = patch.autoUnlock;
    if (patch.notificationPreferences !== undefined) {
      const existing = (current.notificationPreferences ?? {}) as Record<string, boolean>;
      data.notificationPreferences = { ...existing, ...patch.notificationPreferences };
    }
    const user = await this.prisma.user.update({
      where: { id: userId },
      data,
      include: withIdentities,
    });
    return toUserDto(user);
  }

  /**
   * Suppression différée (§14, Google Play) : compte désactivé immédiatement (DELETION_PENDING),
   * jetons révoqués, anonymisation par la tâche planifiée après le délai de grâce. Idempotent.
   */
  async deleteMe(userId: string, ip?: string): Promise<DeleteMeResultDto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found' });
    if (user.status === 'DELETION_PENDING' && user.deletionScheduledAt) {
      await AuthService.revokeAllTokens(this.prisma, userId);
      return { scheduledFor: user.deletionScheduledAt.toISOString() };
    }
    if (user.status !== 'ACTIVE') {
      throw new ConflictException({ code: 'USER_NOT_ACTIVE', message: 'Account is not active' });
    }
    const scheduledFor = new Date(Date.now() + this.config.accountDeletionGraceDays * 86_400_000);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { status: 'DELETION_PENDING', deletionScheduledAt: scheduledFor },
      });
      await AuthService.revokeAllTokens(tx, userId);
      await this.audit.record(
        {
          actor: null,
          actorLabel: `user:${userId}`,
          action: 'user.delete_request',
          targetType: 'user',
          targetId: userId,
          oldValue: { status: user.status },
          newValue: { status: 'DELETION_PENDING', scheduledFor },
          ip,
        },
        tx,
      );
    });
    return { scheduledFor: scheduledFor.toISOString() };
  }

  /** Annulation dans le délai (par reconnexion) ; sans effet si le compte est déjà actif. */
  async cancelDeletion(userId: string, ip?: string): Promise<UserDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: withIdentities,
    });
    if (!user) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found' });
    if (user.status === 'ACTIVE') return toUserDto(user);
    if (user.status !== 'DELETION_PENDING') {
      throw new ConflictException({
        code: 'DELETION_NOT_PENDING',
        message: 'This account is not awaiting deletion',
      });
    }
    const restored = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: { status: 'ACTIVE', deletionScheduledAt: null },
        include: withIdentities,
      });
      await this.audit.record(
        {
          actor: null,
          actorLabel: `user:${userId}`,
          action: 'user.delete_cancel',
          targetType: 'user',
          targetId: userId,
          oldValue: { status: 'DELETION_PENDING', scheduledFor: user.deletionScheduledAt },
          newValue: { status: 'ACTIVE' },
          ip,
        },
        tx,
      );
      return updated;
    });
    return toUserDto(restored);
  }
}
