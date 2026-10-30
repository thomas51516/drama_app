import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  publishedSeriesWhere,
  type ViewerContext,
  visibleEpisodeWhere,
} from '../catalog/catalog.where.js';
import { computeAccess, EntitlementService } from '../catalog/entitlement.service.js';
import {
  type Episode,
  Prisma,
  type Series,
  type UnlockMethod,
} from '../generated/prisma/client.js';
import { MonetizationSettingsService } from '../monetization/monetization-settings.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { type WalletDto } from '../wallet/dto/wallet.dto.js';
import {
  type Balances,
  type Charged,
  spendable,
  toWalletDto,
  WalletService,
} from '../wallet/wallet.service.js';
import {
  type SeriesUnlocksDto,
  type UnlockAllQuoteDto,
  type UnlockAllResultDto,
  type UnlockMethodLabel,
  type UnlockResultDto,
} from './dto/unlock.dto.js';
import { quoteUnlockAll } from './unlock-all-pricing.js';

export type UnlockOutcome =
  | {
      kind: 'unlocked';
      method: UnlockMethodLabel;
      charged: Charged;
      balance: number;
      created: boolean;
    }
  | { kind: 'insufficient'; cost: number; balance: number };

const METHOD_LABELS: Record<UnlockMethod, UnlockMethodLabel> = {
  COINS: 'coins',
  AD: 'ad',
  VIP: 'vip',
  FREE: 'free',
};

/**
 * Déblocage (§8.4, S07-BE-02/03) : débit et création de `unlocks` dans UNE transaction, sous le
 * verrou du portefeuille ; idempotent par `unlocks (user, episode)` et par la clé de l'app ;
 * épisode gratuit ou VIP actif → aucun débit ; solde insuffisant ou négatif → 402.
 */
@Injectable()
export class UnlockService {
  private readonly logger = new Logger(UnlockService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly entitlements: EntitlementService,
    private readonly settings: MonetizationSettingsService,
  ) {}

  async unlockWithCoins(
    userId: string,
    episodeId: string,
    idempotencyKey: string,
    viewer: ViewerContext,
  ): Promise<UnlockResultDto> {
    const episode = await this.findEpisode(episodeId, viewer);
    await this.assertActive(userId);
    const outcome = await this.unlock(userId, episode, episode.series, { idempotencyKey });
    if (outcome.kind === 'insufficient') {
      throw new HttpException(
        {
          code: 'INSUFFICIENT_COINS',
          message: 'Not enough coins to unlock this episode',
          details: { cost: outcome.cost, balance: outcome.balance },
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
    return {
      episodeId: episode.id,
      method: outcome.method,
      charged: outcome.charged,
      wallet: await this.wallet.getWallet(userId),
    };
  }

  async listSeriesUnlocks(userId: string, seriesId: string): Promise<SeriesUnlocksDto> {
    const rows = await this.prisma.unlock.findMany({
      where: { userId, episode: { seriesId } },
      select: { episodeId: true },
      orderBy: { createdAt: 'asc' },
    });
    return { unlockedEpisodeIds: rows.map((r) => r.episodeId) };
  }

  /**
   * Cœur du déblocage, partagé avec le déblocage automatique de `/play` (S07-BE-03).
   * `episode` doit déjà être visible pour le spectateur.
   */
  async unlock(
    userId: string,
    episode: Episode,
    series: Pick<Series, 'id' | 'freeEpisodeCount' | 'coinCostPerEpisode'>,
    opts: { idempotencyKey?: string } = {},
    now = new Date(),
  ): Promise<UnlockOutcome> {
    const entitlements = await this.entitlements.forViewer(userId, [episode.id]);
    const access = computeAccess(episode, series, entitlements);
    if (access === 'free') {
      const balance = (await this.wallet.balances(userId)).total;
      return {
        kind: 'unlocked',
        method: 'free',
        charged: { bonus: 0, purchased: 0 },
        balance,
        created: false,
      };
    }
    const existing = await this.prisma.unlock.findUnique({
      where: { userId_episodeId: { userId, episodeId: episode.id } },
      select: { method: true },
    });
    if (existing) {
      const balance = (await this.wallet.balances(userId)).total;
      return {
        kind: 'unlocked',
        method: METHOD_LABELS[existing.method],
        charged: { bonus: 0, purchased: 0 },
        balance,
        created: false,
      };
    }
    if (entitlements.isVip) {
      await this.recordWithoutDebit(this.prisma, userId, episode.id, 'VIP', opts.idempotencyKey);
      const balance = (await this.wallet.balances(userId)).total;
      return {
        kind: 'unlocked',
        method: 'vip',
        charged: { bonus: 0, purchased: 0 },
        balance,
        created: true,
      };
    }

    const cost = series.coinCostPerEpisode;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const state = await this.wallet.lockAndProject(tx, userId, now);
        // Relecture sous verrou : un appel concurrent a pu créer le déblocage entre-temps.
        const raced = await tx.unlock.findUnique({
          where: { userId_episodeId: { userId, episodeId: episode.id } },
          select: { method: true },
        });
        if (raced) {
          return {
            kind: 'unlocked' as const,
            method: METHOD_LABELS[raced.method],
            charged: { bonus: 0, purchased: 0 },
            balance: state.purchased + state.bonus,
            created: false,
          };
        }
        const unlock = await tx.unlock.create({
          data: {
            userId,
            episodeId: episode.id,
            method: 'COINS',
            idempotencyKey: opts.idempotencyKey ?? null,
          },
        });
        const debit = await this.wallet.debitForUnlock(tx, userId, state, cost, unlock.id, now);
        if (!debit) {
          throw new InsufficientCoins(cost, spendable(state, now));
        }
        if (debit.entryIds[0]) {
          await tx.unlock.update({
            where: { id: unlock.id },
            data: { ledgerEntryId: debit.entryIds[0] },
          });
        }
        return {
          kind: 'unlocked' as const,
          method: 'coins' as const,
          charged: debit.charged,
          balance: debit.balances.total,
          created: true,
        };
      });
    } catch (err) {
      if (err instanceof InsufficientCoins) {
        return { kind: 'insufficient', cost: err.cost, balance: err.balance };
      }
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // Course perdue sur `unlocks (user, episode)` : l'autre appel a gagné, le résultat est le même.
        this.logger.warn(
          `Concurrent unlock for ${userId}/${episode.id}, returning existing unlock`,
        );
        return this.unlock(userId, episode, series, opts, now);
      }
      throw err;
    }
  }

  // ------------------------------------------------------------------ série entière (M-23, S10-BE-02)

  async quoteUnlockAll(
    userId: string,
    seriesId: string,
    viewer: ViewerContext,
    now = new Date(),
  ): Promise<UnlockAllQuoteDto> {
    const { series, locked } = await this.lockedEpisodes(userId, seriesId, viewer, now);
    const discount = (await this.settings.get()).seriesUnlockDiscountPercent;
    return quoteUnlockAll(locked.length, series.coinCostPerEpisode, discount);
  }

  /**
   * Déblocage de tous les épisodes verrouillés d'une série : une transaction (verrou du portefeuille,
   * relecture des déblocages, création des `unlocks`, une ligne de débit par lot consommé) ;
   * idempotent par `idempotencyKey` (rejeu → même liste, aucun second débit) et par `unlocks (user, episode)`.
   */
  async unlockAll(
    userId: string,
    seriesId: string,
    idempotencyKey: string,
    viewer: ViewerContext,
    now = new Date(),
  ): Promise<UnlockAllResultDto> {
    await this.assertActive(userId);
    const replay = await this.replayUnlockAll(userId, seriesId, idempotencyKey);
    if (replay) return { ...replay, wallet: await this.wallet.getWallet(userId, now) };

    const { series, locked } = await this.lockedEpisodes(userId, seriesId, viewer, now);
    const discount = (await this.settings.get()).seriesUnlockDiscountPercent;
    if (locked.length === 0) {
      return {
        unlockedEpisodeIds: [],
        charged: { bonus: 0, purchased: 0 },
        wallet: await this.wallet.getWallet(userId, now),
      };
    }
    const prefix = `series_unlock:${userId}:${seriesId}:${idempotencyKey}`;
    try {
      const outcome = await this.prisma.$transaction(async (tx) => {
        const state = await this.wallet.lockAndProject(tx, userId, now);
        const already = await tx.unlock.findMany({
          where: { userId, episodeId: { in: locked.map((e) => e.id) } },
          select: { episodeId: true },
        });
        const done = new Set(already.map((u) => u.episodeId));
        const toUnlock = locked.filter((e) => !done.has(e.id));
        const quote = quoteUnlockAll(toUnlock.length, series.coinCostPerEpisode, discount);
        if (toUnlock.length === 0) {
          return { unlockedEpisodeIds: [] as string[], charged: { bonus: 0, purchased: 0 } };
        }
        if (!this.canPay(state, quote.price, now)) {
          throw new InsufficientCoins(quote.price, spendable(state, now));
        }
        await tx.unlock.createMany({
          data: toUnlock.map((e) => ({
            userId,
            episodeId: e.id,
            method: 'COINS' as const,
            idempotencyKey,
          })),
        });
        const debit =
          quote.price > 0
            ? await this.wallet.debit(
                tx,
                userId,
                state,
                quote.price,
                {
                  referenceType: 'series_unlock',
                  referenceId: seriesId,
                  idempotencyPrefix: prefix,
                  note: `Series unlocked (${toUnlock.length} episodes)`,
                },
                now,
              )
            : null;
        if (quote.price > 0 && !debit) {
          throw new InsufficientCoins(quote.price, spendable(state, now));
        }
        return {
          unlockedEpisodeIds: toUnlock.map((e) => e.id),
          charged: debit?.charged ?? { bonus: 0, purchased: 0 },
        };
      });
      return { ...outcome, wallet: await this.wallet.getWallet(userId, now) };
    } catch (err) {
      if (err instanceof InsufficientCoins) {
        throw new HttpException(
          {
            code: 'INSUFFICIENT_COINS',
            message: 'Not enough coins to unlock this series',
            details: { cost: err.cost, balance: err.balance },
          },
          HttpStatus.PAYMENT_REQUIRED,
        );
      }
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // Course perdue (déblocage concurrent ou rejeu simultané) : la relecture donne le même résultat.
        this.logger.warn(`Concurrent unlock-all for ${userId}/${seriesId}, retrying once`);
        const replayed = await this.replayUnlockAll(userId, seriesId, idempotencyKey);
        if (replayed) return { ...replayed, wallet: await this.wallet.getWallet(userId, now) };
        return this.unlockAll(userId, seriesId, idempotencyKey, viewer, now);
      }
      throw err;
    }
  }

  private canPay(
    state: Awaited<ReturnType<WalletService['lockAndProject']>>,
    cost: number,
    now: Date,
  ) {
    return state.purchased >= 0 && state.bonus >= 0 && spendable(state, now) >= cost;
  }

  /** Rejeu d'un `unlock-all` déjà exécuté avec la même clé : liste et débit d'origine. */
  private async replayUnlockAll(
    userId: string,
    seriesId: string,
    idempotencyKey: string,
  ): Promise<{ unlockedEpisodeIds: string[]; charged: Charged } | null> {
    const unlocks = await this.prisma.unlock.findMany({
      where: { userId, idempotencyKey, episode: { seriesId } },
      select: { episodeId: true },
      orderBy: { createdAt: 'asc' },
    });
    if (unlocks.length === 0) return null;
    const lines = await this.prisma.coinLedgerEntry.findMany({
      where: {
        userId,
        idempotencyKey: { startsWith: `series_unlock:${userId}:${seriesId}:${idempotencyKey}:` },
      },
      select: { amount: true, bucket: true },
    });
    const charged = { bonus: 0, purchased: 0 };
    for (const l of lines) charged[l.bucket === 'BONUS' ? 'bonus' : 'purchased'] -= l.amount;
    return { unlockedEpisodeIds: unlocks.map((u) => u.episodeId), charged };
  }

  /** Série visible et ses épisodes visibles encore verrouillés pour le compte. */
  private async lockedEpisodes(userId: string, seriesId: string, viewer: ViewerContext, now: Date) {
    const series = await this.prisma.series.findFirst({
      where: { id: seriesId, ...publishedSeriesWhere(viewer, now) },
      select: { id: true, freeEpisodeCount: true, coinCostPerEpisode: true },
    });
    if (!series)
      throw new NotFoundException({ code: 'SERIES_NOT_FOUND', message: 'Series not found' });
    const episodes = await this.prisma.episode.findMany({
      where: { seriesId, ...visibleEpisodeWhere(now) },
      select: { id: true, number: true },
      orderBy: { number: 'asc' },
    });
    const entitlements = await this.entitlements.forViewer(
      userId,
      episodes.map((e) => e.id),
    );
    const locked = episodes.filter((e) => computeAccess(e, series, entitlements) === 'locked');
    return { series, locked };
  }

  /** Solde dépensable et coût pour la réponse `EPISODE_LOCKED` (details.balance, canAutoUnlock). */
  async quote(
    userId: string,
    cost: number,
    now = new Date(),
  ): Promise<{ balance: number; affordable: boolean }> {
    const [balances, lots] = await Promise.all([
      this.wallet.balances(userId),
      this.wallet.bonusLots(this.prisma, userId),
    ]);
    const state = { purchased: balances.purchased, bonus: balances.bonus, lots };
    const balance = spendable(state, now);
    const affordable = balances.purchased >= 0 && balances.bonus >= 0 && balance >= cost;
    return { balance, affordable };
  }

  walletDto(userId: string): Promise<WalletDto> {
    return this.wallet.getWallet(userId);
  }

  /** Déblocage sans débit (VIP, pub récompensée) : insertion idempotente sur `unlocks (user, episode)`. */
  async recordWithoutDebit(
    tx: Prisma.TransactionClient | PrismaService,
    userId: string,
    episodeId: string,
    method: UnlockMethod,
    idempotencyKey?: string,
  ): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO unlocks (id, user_id, episode_id, method, idempotency_key, created_at)
      VALUES (gen_random_uuid(), ${userId}::uuid, ${episodeId}::uuid, ${method}::unlock_method, ${idempotencyKey ?? null}, now())
      ON CONFLICT (user_id, episode_id) DO NOTHING`;
  }

  private async findEpisode(episodeId: string, viewer: ViewerContext) {
    const episode = await this.prisma.episode.findFirst({
      where: { id: episodeId, ...visibleEpisodeWhere(), series: publishedSeriesWhere(viewer) },
      include: { series: true },
    });
    if (!episode) {
      throw new NotFoundException({ code: 'EPISODE_NOT_FOUND', message: 'Episode not found' });
    }
    return episode;
  }

  private async assertActive(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { status: true },
    });
    if (!user || (user.status !== 'ACTIVE' && user.status !== 'DELETION_PENDING')) {
      throw new ForbiddenException({ code: 'USER_BLOCKED', message: 'Account is not active' });
    }
  }
}

class InsufficientCoins extends Error {
  constructor(
    readonly cost: number,
    readonly balance: number,
  ) {
    super('INSUFFICIENT_COINS');
  }
}

export function balancesToWallet(balances: Balances, autoUnlock: boolean): WalletDto {
  return toWalletDto(balances, [], autoUnlock);
}
