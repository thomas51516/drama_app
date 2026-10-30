import { Injectable, Logger } from '@nestjs/common';
import { AuditService } from '../admin/audit/audit.service.js';
import { AuthService } from '../auth/auth.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { DELETED_DISPLAY_NAME } from './users.service.js';

export const ANONYMISE_BATCH_SIZE = 100;

/**
 * Anonymisation des comptes dont le délai de grâce est écoulé (S05-BE-04, §14) : e-mail, téléphone,
 * mot de passe, identités et appareil effacés, nom « Utilisateur supprimé », favoris, « J'aime » et
 * progression supprimés ; grand livre, portefeuille, achats et déblocages conservés pour la
 * comptabilité, rattachés à l'utilisateur anonymisé (statut DELETED).
 */
@Injectable()
export class AccountDeletionService {
  private readonly logger = new Logger(AccountDeletionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Traite un lot de comptes échus ; renvoie les identifiants anonymisés. */
  async runOnce(now = new Date()): Promise<string[]> {
    const due = await this.prisma.user.findMany({
      where: { status: 'DELETION_PENDING', deletionScheduledAt: { lte: now } },
      select: { id: true },
      orderBy: { deletionScheduledAt: 'asc' },
      take: ANONYMISE_BATCH_SIZE,
    });
    const done: string[] = [];
    for (const { id } of due) {
      try {
        await this.anonymise(id);
        done.push(id);
      } catch (err) {
        this.logger.error(`Anonymisation failed for ${id}: ${(err as Error).message}`);
      }
    }
    if (done.length > 0) this.logger.log(`Anonymised ${done.length} account(s)`);
    return done;
  }

  async anonymise(userId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user || user.status !== 'DELETION_PENDING') return;
      const likes = await tx.like.findMany({ where: { userId }, select: { seriesId: true } });
      for (const { seriesId } of likes) {
        await tx.series.update({ where: { id: seriesId }, data: { likesCount: { decrement: 1 } } });
      }
      await tx.like.deleteMany({ where: { userId } });
      await tx.favorite.deleteMany({ where: { userId } });
      await tx.watchProgress.deleteMany({ where: { userId } });
      await tx.userIdentity.deleteMany({ where: { userId } });
      await AuthService.revokeAllTokens(tx, userId);
      await tx.user.update({
        where: { id: userId },
        data: {
          status: 'DELETED',
          email: null,
          phone: null,
          passwordHash: null,
          displayName: DELETED_DISPLAY_NAME,
          deviceId: null,
          notificationPreferences: Prisma.DbNull,
          isVip: false,
          vipExpiresAt: null,
        },
      });
      await this.audit.record(
        {
          actor: null,
          actorLabel: 'job:account-anonymiser',
          action: 'user.anonymise',
          targetType: 'user',
          targetId: userId,
          oldValue: { status: user.status, scheduledFor: user.deletionScheduledAt },
          newValue: { status: 'DELETED' },
        },
        tx,
      );
    });
  }
}
