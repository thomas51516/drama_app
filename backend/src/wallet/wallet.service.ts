import { randomUUID } from 'node:crypto';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuditService } from '../admin/audit/audit.service.js';
import { type AuthenticatedAdmin } from '../common/request-context.js';
import {
  type CoinBucket,
  type CoinLedgerEntry,
  type LedgerEntryType,
  type Prisma,
} from '../generated/prisma/client.js';
import { MonetizationSettingsService } from '../monetization/monetization-settings.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { type BonusLot, planBonusConsumption, sortLots } from './bonus-lots.js';
import {
  type LedgerEntryDto,
  type WalletDto,
  type WalletTransactionsDto,
  type WalletTransactionsQueryDto,
} from './dto/wallet.dto.js';

type Tx = Prisma.TransactionClient;

/** État du grand livre d'un utilisateur, calculé sous verrou (`SELECT … FOR UPDATE` sur `wallets`). */
export interface LedgerState {
  purchased: number;
  bonus: number;
  lots: BonusLot[];
}

export interface Balances {
  purchased: number;
  bonus: number;
  total: number;
}

export interface Charged {
  bonus: number;
  purchased: number;
}

export interface CoinAdjustment {
  amount: number;
  bucket: CoinBucket;
  reason: string;
}

/**
 * Portefeuille (§8.4, S07-BE-01/04) : SEUL point d'écriture de `coin_ledger`. Toute variation
 * est une ligne append-only ; `wallets` est un cache recalculé depuis le grand livre dans la même
 * transaction (jamais incrémenté à l'aveugle). Pièces bonus consommées avant les achetées, lots
 * les plus proches de l'expiration d'abord ; un solde négatif (remboursement) bloque tout débit.
 */
@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: MonetizationSettingsService,
    private readonly audit: AuditService,
  ) {}

  // ------------------------------------------------------------------ lecture

  async getWallet(userId: string, now = new Date()): Promise<WalletDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { autoUnlock: true },
    });
    if (!user) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found' });
    if (await this.hasExpiredBonus(userId, now)) {
      await this.prisma.$transaction((tx) => this.lockAndProject(tx, userId, now));
    }
    const [balances, lots] = await Promise.all([
      this.balances(userId),
      this.bonusLots(this.prisma, userId),
    ]);
    return toWalletDto(balances, lots, user.autoUnlock, now);
  }

  /** Soldes depuis la projection `wallets` (créée à la volée si absente). */
  async balances(userId: string, tx: Tx = this.prisma): Promise<Balances> {
    const wallet = await tx.wallet.findUnique({ where: { userId } });
    const purchased = wallet?.purchasedBalance ?? 0;
    const bonus = wallet?.bonusBalance ?? 0;
    return { purchased, bonus, total: purchased + bonus };
  }

  async listTransactions(
    userId: string,
    query: WalletTransactionsQueryDto,
  ): Promise<WalletTransactionsDto> {
    const where: Prisma.CoinLedgerEntryWhereInput = {
      userId,
      ...(query.type ? { type: query.type } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.coinLedgerEntry.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.coinLedgerEntry.count({ where }),
    ]);
    return { items: rows.map(toLedgerEntryDto), total, page: query.page, pageSize: query.pageSize };
  }

  async recentEntries(userId: string, take = 20): Promise<LedgerEntryDto[]> {
    const rows = await this.prisma.coinLedgerEntry.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
    });
    return rows.map(toLedgerEntryDto);
  }

  // ------------------------------------------------------------------ écriture (transactionnelle)

  /**
   * Verrouille la ligne `wallets` de l'utilisateur (créée si besoin), fait expirer les lots bonus
   * échus (lignes EXPIRY), recalcule la projection depuis le grand livre et renvoie l'état.
   * À appeler en tête de toute transaction qui débite ou crédite.
   */
  async lockAndProject(tx: Tx, userId: string, now = new Date()): Promise<LedgerState> {
    await tx.$executeRaw`
      INSERT INTO wallets (user_id, purchased_balance, bonus_balance, updated_at)
      VALUES (${userId}::uuid, 0, 0, now()) ON CONFLICT (user_id) DO NOTHING`;
    await tx.$queryRaw`SELECT user_id FROM wallets WHERE user_id = ${userId}::uuid FOR UPDATE`;

    const lots = await this.bonusLots(tx, userId);
    for (const lot of lots) {
      if (lot.expiresAt && lot.expiresAt <= now && lot.remaining > 0) {
        await this.append(tx, {
          userId,
          amount: -lot.remaining,
          bucket: 'BONUS',
          type: 'EXPIRY',
          referenceType: 'bonus_expiry',
          referenceId: lot.expiresAt.toISOString(),
          idempotencyKey: `expiry:${userId}:${lot.expiresAt.toISOString()}:${now.getTime()}`,
          expiresAt: lot.expiresAt,
          note: 'Bonus coins expired',
        });
        lot.remaining = 0;
      }
    }
    const balances = await this.syncProjection(tx, userId);
    return { ...balances, lots };
  }

  /** Débit d'un déblocage (S07-BE-02) : bonus d'abord, puis achetées ; `null` si solde insuffisant. */
  async debitForUnlock(
    tx: Tx,
    userId: string,
    state: LedgerState,
    cost: number,
    unlockId: string,
    now = new Date(),
  ): Promise<{ charged: Charged; entryIds: string[]; balances: Balances } | null> {
    if (!canAfford(state, cost, now)) return null;
    const plan = planBonusConsumption(state.lots, cost, now);
    const entryIds: string[] = [];
    let n = 0;
    for (const debit of plan.debits) {
      const row = await this.append(tx, {
        userId,
        amount: -debit.amount,
        bucket: 'BONUS',
        type: 'UNLOCK',
        referenceType: 'unlock',
        referenceId: unlockId,
        idempotencyKey: `unlock:${unlockId}:${n++}`,
        expiresAt: debit.expiresAt,
        note: 'Episode unlocked with bonus coins',
      });
      entryIds.push(row.id);
    }
    if (plan.remainder > 0) {
      const row = await this.append(tx, {
        userId,
        amount: -plan.remainder,
        bucket: 'PURCHASED',
        type: 'UNLOCK',
        referenceType: 'unlock',
        referenceId: unlockId,
        idempotencyKey: `unlock:${unlockId}:${n}`,
        expiresAt: null,
        note: 'Episode unlocked with purchased coins',
      });
      entryIds.push(row.id);
    }
    const balances = await this.syncProjection(tx, userId);
    return {
      charged: { bonus: cost - plan.remainder, purchased: plan.remainder },
      entryIds,
      balances,
    };
  }

  /** Crédit d'un pack (S07-BE-06) : une ligne PURCHASE + une ligne BONUS expirable. Idempotent par achat. */
  async creditPurchase(
    tx: Tx,
    userId: string,
    purchase: { id: string; coins: number; bonusCoins: number },
    now = new Date(),
  ): Promise<Balances> {
    await this.lockAndProject(tx, userId, now);
    const validityDays = await this.settings.bonusValidityDays();
    if (purchase.coins > 0) {
      await this.appendOnce(tx, {
        userId,
        amount: purchase.coins,
        bucket: 'PURCHASED',
        type: 'PURCHASE',
        referenceType: 'purchase',
        referenceId: purchase.id,
        idempotencyKey: `purchase:${purchase.id}:coins`,
        note: 'Coin pack purchased',
      });
    }
    if (purchase.bonusCoins > 0) {
      await this.appendOnce(tx, {
        userId,
        amount: purchase.bonusCoins,
        bucket: 'BONUS',
        type: 'BONUS',
        referenceType: 'purchase',
        referenceId: purchase.id,
        idempotencyKey: `purchase:${purchase.id}:bonus`,
        expiresAt: new Date(now.getTime() + validityDays * 86_400_000),
        note: 'Coin pack bonus',
      });
    }
    return this.syncProjection(tx, userId);
  }

  /** Remboursement d'un pack (RTDN, S07-BE-07) : lignes REFUND négatives ; le solde peut devenir négatif. */
  async refundPurchase(
    tx: Tx,
    userId: string,
    purchase: { id: string; coins: number; bonusCoins: number },
    now = new Date(),
  ): Promise<Balances> {
    await this.lockAndProject(tx, userId, now);
    if (purchase.coins > 0) {
      await this.appendOnce(tx, {
        userId,
        amount: -purchase.coins,
        bucket: 'PURCHASED',
        type: 'REFUND',
        referenceType: 'refund',
        referenceId: purchase.id,
        idempotencyKey: `refund:${purchase.id}:coins`,
        note: 'Coin pack refunded',
      });
    }
    if (purchase.bonusCoins > 0) {
      const original = await tx.coinLedgerEntry.findUnique({
        where: { idempotencyKey: `purchase:${purchase.id}:bonus` },
        select: { expiresAt: true },
      });
      await this.appendOnce(tx, {
        userId,
        amount: -purchase.bonusCoins,
        bucket: 'BONUS',
        type: 'REFUND',
        referenceType: 'refund',
        referenceId: purchase.id,
        idempotencyKey: `refund:${purchase.id}:bonus`,
        expiresAt: original?.expiresAt ?? null,
        note: 'Coin pack bonus revoked after refund',
      });
    }
    return this.syncProjection(tx, userId);
  }

  /** Crédit ou débit manuel du back-office (B-09) : ligne ADJUSTMENT, audit avec motif et soldes avant / après. */
  async adjust(
    userId: string,
    adjustment: CoinAdjustment,
    admin: AuthenticatedAdmin,
    ip?: string,
    now = new Date(),
  ): Promise<WalletDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { autoUnlock: true },
    });
    if (!user) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found' });
    const validityDays = await this.settings.bonusValidityDays();
    const adjustmentId = randomUUID();
    const reason = adjustment.reason.trim();

    const { before, after, lots } = await this.prisma.$transaction(async (tx) => {
      const state = await this.lockAndProject(tx, userId, now);
      const before = {
        purchased: state.purchased,
        bonus: state.bonus,
        total: state.purchased + state.bonus,
      };
      const base = {
        userId,
        type: 'ADJUSTMENT' as const,
        referenceType: 'admin_adjustment',
        referenceId: adjustmentId,
        note: reason,
      };
      if (adjustment.bucket === 'PURCHASED' || adjustment.amount > 0) {
        await this.append(tx, {
          ...base,
          amount: adjustment.amount,
          bucket: adjustment.bucket,
          idempotencyKey: `adjust:${adjustmentId}`,
          expiresAt:
            adjustment.bucket === 'BONUS'
              ? new Date(now.getTime() + validityDays * 86_400_000)
              : null,
        });
      } else {
        // Débit de bonus : imputé aux lots existants (les plus proches de l'expiration d'abord),
        // le reste sur un lot sans expiration (le solde bonus peut devenir négatif).
        const plan = planBonusConsumption(state.lots, -adjustment.amount, now);
        let n = 0;
        for (const debit of plan.debits) {
          await this.append(tx, {
            ...base,
            amount: -debit.amount,
            bucket: 'BONUS',
            idempotencyKey: `adjust:${adjustmentId}:${n++}`,
            expiresAt: debit.expiresAt,
          });
        }
        if (plan.remainder > 0) {
          await this.append(tx, {
            ...base,
            amount: -plan.remainder,
            bucket: 'BONUS',
            idempotencyKey: `adjust:${adjustmentId}:${n}`,
            expiresAt: null,
          });
        }
      }
      const after = await this.syncProjection(tx, userId);
      await this.audit.record(
        {
          actor: admin,
          action: 'wallet.adjust',
          targetType: 'wallet',
          targetId: userId,
          oldValue: before,
          newValue: {
            ...after,
            amount: adjustment.amount,
            bucket: adjustment.bucket,
            reason,
            adjustmentId,
          },
          ip,
        },
        tx,
      );
      return { before, after, lots: await this.bonusLots(tx, userId) };
    });
    this.logger.log(
      `Wallet ${userId} adjusted by ${admin.email}: ${adjustment.amount} ${adjustment.bucket} (${before.total} → ${after.total})`,
    );
    return toWalletDto(after, lots, user.autoUnlock, now);
  }

  /** Tâche planifiée (§8.4) : lignes EXPIRY pour tous les lots bonus échus. Renvoie le nombre d'utilisateurs traités. */
  async expireBonuses(now = new Date()): Promise<number> {
    const users = await this.prisma.$queryRaw<{ user_id: string }[]>`
      SELECT DISTINCT user_id FROM (
        SELECT user_id, expires_at, SUM(amount) AS remaining
        FROM coin_ledger
        WHERE bucket = 'BONUS' AND expires_at IS NOT NULL AND expires_at <= ${now}
        GROUP BY user_id, expires_at
        HAVING SUM(amount) > 0
      ) expired`;
    for (const { user_id } of users) {
      await this.prisma.$transaction((tx) => this.lockAndProject(tx, user_id, now));
    }
    if (users.length > 0) this.logger.log(`Expired bonus coins for ${users.length} user(s)`);
    return users.length;
  }

  // ------------------------------------------------------------------ interne

  /** Lots bonus (lignes BONUS groupées par date d'expiration), solde non nul, triés. */
  async bonusLots(tx: Tx, userId: string): Promise<BonusLot[]> {
    const rows = await tx.$queryRaw<{ expires_at: Date | null; remaining: number }[]>`
      SELECT expires_at, SUM(amount)::int AS remaining
      FROM coin_ledger
      WHERE user_id = ${userId}::uuid AND bucket = 'BONUS'
      GROUP BY expires_at
      HAVING SUM(amount) <> 0`;
    return sortLots(rows.map((r) => ({ expiresAt: r.expires_at, remaining: r.remaining })));
  }

  private async hasExpiredBonus(userId: string, now: Date): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM (
        SELECT expires_at FROM coin_ledger
        WHERE user_id = ${userId}::uuid AND bucket = 'BONUS' AND expires_at IS NOT NULL AND expires_at <= ${now}
        GROUP BY expires_at HAVING SUM(amount) > 0
      ) expired`;
    return (rows[0]?.n ?? 0) > 0;
  }

  /** Recalcule `wallets` depuis SUM(amount) par bucket (sous le verrou pris par `lockAndProject`). */
  async syncProjection(tx: Tx, userId: string): Promise<Balances> {
    const sums = await tx.$queryRaw<{ bucket: CoinBucket; total: number }[]>`
      SELECT bucket, COALESCE(SUM(amount), 0)::int AS total
      FROM coin_ledger WHERE user_id = ${userId}::uuid GROUP BY bucket`;
    const purchased = sums.find((s) => s.bucket === 'PURCHASED')?.total ?? 0;
    const bonus = sums.find((s) => s.bucket === 'BONUS')?.total ?? 0;
    await tx.wallet.upsert({
      where: { userId },
      create: { userId, purchasedBalance: purchased, bonusBalance: bonus },
      update: { purchasedBalance: purchased, bonusBalance: bonus },
    });
    return { purchased, bonus, total: purchased + bonus };
  }

  private append(tx: Tx, data: LedgerInput): Promise<CoinLedgerEntry> {
    return tx.coinLedgerEntry.create({ data });
  }

  /** Insertion idempotente par clé (rejeu d'un crédit ou d'un remboursement). */
  private async appendOnce(tx: Tx, data: LedgerInput): Promise<void> {
    const existing = await tx.coinLedgerEntry.findUnique({
      where: { idempotencyKey: data.idempotencyKey },
      select: { id: true },
    });
    if (!existing) await tx.coinLedgerEntry.create({ data });
  }
}

interface LedgerInput {
  userId: string;
  amount: number;
  bucket: CoinBucket;
  type: LedgerEntryType;
  referenceType: string;
  referenceId: string;
  idempotencyKey: string;
  expiresAt?: Date | null;
  note?: string;
}

/** Solde dépensable : lots bonus valables + achetées ; tout bucket négatif bloque (§10 remboursements). */
export function canAfford(state: LedgerState, cost: number, now: Date): boolean {
  if (state.purchased < 0 || state.bonus < 0) return false;
  return spendable(state, now) >= cost;
}

export function spendable(state: LedgerState, now: Date): number {
  const bonus = state.lots
    .filter((l) => l.remaining > 0 && (l.expiresAt === null || l.expiresAt > now))
    .reduce((sum, l) => sum + l.remaining, 0);
  return Math.max(0, state.purchased) + bonus;
}

export function toWalletDto(
  balances: Balances,
  lots: BonusLot[],
  autoUnlock: boolean,
  now = new Date(),
): WalletDto {
  return {
    purchased: balances.purchased,
    bonus: balances.bonus,
    total: balances.total,
    autoUnlock,
    bonusExpiring: sortLots(lots)
      .filter((l) => l.remaining > 0 && l.expiresAt !== null && l.expiresAt > now)
      .map((l) => ({ amount: l.remaining, expiresAt: l.expiresAt!.toISOString() })),
  };
}

export function toLedgerEntryDto(e: CoinLedgerEntry): LedgerEntryDto {
  return {
    id: e.id,
    amount: e.amount,
    bucket: e.bucket,
    type: e.type,
    reference:
      e.referenceType && e.referenceId ? { type: e.referenceType, id: e.referenceId } : null,
    description: e.note,
    expiresAt: e.expiresAt?.toISOString() ?? null,
    createdAt: e.createdAt.toISOString(),
  };
}
