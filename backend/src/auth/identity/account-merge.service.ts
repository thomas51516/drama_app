import { Injectable, Logger } from '@nestjs/common';
import { AuditService } from '../../admin/audit/audit.service.js';
import { type Prisma, type User } from '../../generated/prisma/client.js';
import { AuthService } from '../auth.service.js';

type Tx = Prisma.TransactionClient;

export interface MergeSummary {
  guestId: string;
  targetId: string;
  purchasedTransferred: number;
  bonusTransferred: number;
  progressMoved: number;
  favoritesMoved: number;
  likesMoved: number;
  unlocksMoved: number;
}

/**
 * Fusion d'un compte invité dans un compte inscrit (M-50, contrat public v1.2), en UNE transaction :
 * progression (position la plus avancée), favoris, « J'aime » et déblocages (union), achats et
 * abonnements rattachés, grand livre : le solde de l'invité est transféré par deux lignes
 * ADJUSTMENT (débit invité / crédit cible) par bucket, les lignes d'origine restent à l'invité
 * (append-only). L'invité passe en MERGED et tous ses jetons sont révoqués ; une entrée d'audit
 * `user.merge` est écrite avec l'utilisateur pour auteur.
 */
@Injectable()
export class AccountMergeService {
  private readonly logger = new Logger(AccountMergeService.name);

  constructor(private readonly audit: AuditService) {}

  async merge(tx: Tx, guest: User, target: User, ip?: string): Promise<MergeSummary> {
    if (guest.id === target.id) throw new Error('Cannot merge a user into itself');
    const summary: MergeSummary = {
      guestId: guest.id,
      targetId: target.id,
      purchasedTransferred: 0,
      bonusTransferred: 0,
      progressMoved: 0,
      favoritesMoved: 0,
      likesMoved: 0,
      unlocksMoved: 0,
    };

    // Progression : union, position la plus avancée, terminé si l'un des deux l'est.
    summary.progressMoved = Number(
      await tx.$executeRaw`
        INSERT INTO watch_progress (id, user_id, episode_id, position_seconds, completed, updated_at)
        SELECT gen_random_uuid(), ${target.id}::uuid, episode_id, position_seconds, completed, updated_at
        FROM watch_progress WHERE user_id = ${guest.id}::uuid
        ON CONFLICT (user_id, episode_id) DO UPDATE SET
          position_seconds = GREATEST(watch_progress.position_seconds, EXCLUDED.position_seconds),
          completed = watch_progress.completed OR EXCLUDED.completed,
          updated_at = GREATEST(watch_progress.updated_at, EXCLUDED.updated_at)`,
    );
    await tx.watchProgress.deleteMany({ where: { userId: guest.id } });

    // Favoris : union.
    summary.favoritesMoved = Number(
      await tx.$executeRaw`
        INSERT INTO favorites (user_id, series_id, created_at)
        SELECT ${target.id}::uuid, series_id, created_at FROM favorites WHERE user_id = ${guest.id}::uuid
        ON CONFLICT DO NOTHING`,
    );
    await tx.favorite.deleteMany({ where: { userId: guest.id } });

    // « J'aime » : union ; les doublons sont retirés du compteur de la série.
    const duplicateLikes = await tx.$queryRaw<{ series_id: string }[]>`
      DELETE FROM likes WHERE user_id = ${guest.id}::uuid
        AND series_id IN (SELECT series_id FROM likes WHERE user_id = ${target.id}::uuid)
      RETURNING series_id`;
    for (const { series_id } of duplicateLikes) {
      await tx.series.update({ where: { id: series_id }, data: { likesCount: { decrement: 1 } } });
    }
    summary.likesMoved = (
      await tx.like.updateMany({ where: { userId: guest.id }, data: { userId: target.id } })
    ).count;

    // Déblocages : union (le déblocage déjà possédé par la cible n'est pas dupliqué).
    const owned = await tx.unlock.findMany({
      where: { userId: target.id },
      select: { episodeId: true },
    });
    await tx.unlock.deleteMany({
      where: { userId: guest.id, episodeId: { in: owned.map((u) => u.episodeId) } },
    });
    summary.unlocksMoved = (
      await tx.unlock.updateMany({ where: { userId: guest.id }, data: { userId: target.id } })
    ).count;

    // Achats et abonnements : rattachés au compte cible (historique comptable conservé).
    await tx.purchase.updateMany({ where: { userId: guest.id }, data: { userId: target.id } });
    await tx.subscription.updateMany({ where: { userId: guest.id }, data: { userId: target.id } });

    // Grand livre : transfert du solde par lignes ADJUSTMENT, projections mises à jour en même temps.
    const guestWallet = await tx.wallet.findUnique({ where: { userId: guest.id } });
    await tx.wallet.upsert({
      where: { userId: target.id },
      create: { userId: target.id },
      update: {},
    });
    const purchased = guestWallet?.purchasedBalance ?? 0;
    const bonus = guestWallet?.bonusBalance ?? 0;
    if (purchased > 0) {
      await this.transfer(tx, guest.id, target.id, 'PURCHASED', purchased, null);
      summary.purchasedTransferred = purchased;
    }
    if (bonus > 0) {
      const nextExpiry = await tx.coinLedgerEntry.aggregate({
        where: {
          userId: guest.id,
          bucket: 'BONUS',
          amount: { gt: 0 },
          expiresAt: { gt: new Date() },
        },
        _min: { expiresAt: true },
      });
      await this.transfer(tx, guest.id, target.id, 'BONUS', bonus, nextExpiry._min.expiresAt);
      summary.bonusTransferred = bonus;
    }

    // VIP : le plus favorable des deux.
    const vipExpiresAt =
      [guest.vipExpiresAt, target.vipExpiresAt]
        .filter((d): d is Date => d !== null)
        .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
    await tx.user.update({
      where: { id: target.id },
      data: {
        isVip: target.isVip || guest.isVip,
        vipExpiresAt: target.isVip || guest.isVip ? vipExpiresAt : target.vipExpiresAt,
        country: target.country ?? guest.country,
        displayName: target.displayName ?? guest.displayName,
      },
    });

    // Invité : identités éventuelles déplacées, jetons révoqués, statut MERGED.
    await tx.userIdentity.updateMany({ where: { userId: guest.id }, data: { userId: target.id } });
    await AuthService.revokeAllTokens(tx, guest.id);
    await tx.user.update({
      where: { id: guest.id },
      data: { status: 'MERGED', mergedIntoId: target.id },
    });

    await this.audit.record(
      {
        actor: null,
        actorLabel: `user:${target.id}`,
        action: 'user.merge',
        targetType: 'user',
        targetId: target.id,
        oldValue: { guestId: guest.id, guestStatus: guest.status, purchased, bonus },
        newValue: summary,
        ip,
      },
      tx,
    );
    this.logger.log(`Merged guest ${guest.id} into ${target.id}`);
    return summary;
  }

  private async transfer(
    tx: Tx,
    fromId: string,
    toId: string,
    bucket: 'PURCHASED' | 'BONUS',
    amount: number,
    expiresAt: Date | null,
  ): Promise<void> {
    const field = bucket === 'PURCHASED' ? 'purchasedBalance' : 'bonusBalance';
    const base = `merge:${fromId}:${toId}:${bucket.toLowerCase()}`;
    await tx.coinLedgerEntry.create({
      data: {
        userId: fromId,
        amount: -amount,
        bucket,
        type: 'ADJUSTMENT',
        referenceType: 'account_merge',
        referenceId: toId,
        idempotencyKey: `${base}:out`,
        note: 'Guest account merged: balance transferred',
      },
    });
    await tx.coinLedgerEntry.create({
      data: {
        userId: toId,
        amount,
        bucket,
        type: 'ADJUSTMENT',
        referenceType: 'account_merge',
        referenceId: fromId,
        idempotencyKey: `${base}:in`,
        expiresAt,
        note: 'Guest account merged: balance received',
      },
    });
    await tx.wallet.update({ where: { userId: fromId }, data: { [field]: { decrement: amount } } });
    await tx.wallet.update({ where: { userId: toId }, data: { [field]: { increment: amount } } });
  }
}
