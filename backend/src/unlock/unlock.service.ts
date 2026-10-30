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
import { notImplemented } from '../common/errors/not-implemented.js';
import {
  type Episode,
  Prisma,
  type Series,
  type UnlockMethod,
} from '../generated/prisma/client.js';
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
  type UnlockMethodLabel,
  type UnlockResultDto,
} from './dto/unlock.dto.js';

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
      await this.recordWithoutDebit(userId, episode.id, 'VIP', opts.idempotencyKey);
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

  private async recordWithoutDebit(
    userId: string,
    episodeId: string,
    method: UnlockMethod,
    idempotencyKey?: string,
  ): Promise<void> {
    await this.prisma.$executeRaw`
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

  // TODO S08-BE-03 : callback SSV AdMob signé, plafond quotidien Redis
  rewardFromAd(_payload: unknown): never {
    return notImplemented('S08-BE-03');
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
