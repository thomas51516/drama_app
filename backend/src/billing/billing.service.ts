import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { currencyForCountry } from '../common/money/currency.js';
import { AppConfig } from '../config/app-config.js';
import {
  type Prisma,
  type Purchase,
  type Subscription,
  type SubscriptionPlan,
  type SubscriptionStatus,
  type VipPeriod,
  type VipPlan,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ShopService, toVipPlanDto } from '../monetization/shop.service.js';
import { OffersService } from '../offers/offers.service.js';
import { WalletService } from '../wallet/wallet.service.js';
import {
  type GoogleRtdnDto,
  type GoogleVerifyDto,
  type SubscriptionStatusDto,
  type VerifyResultDto,
} from './dto/billing.dto.js';
import {
  classifyNotification,
  decodeDeveloperNotification,
  ONE_TIME_PRODUCT_CANCELED,
} from './rtdn.js';
import {
  ACCESS_GRANTING_STATES,
  PURCHASE_VERIFIER,
  PurchaseVerificationError,
  type PurchaseVerifier,
  type SubscriptionState,
  type VerifiedSubscription,
} from './verifier/purchase-verifier.js';

type Tx = Prisma.TransactionClient;

const PLAN_BY_PERIOD: Record<VipPeriod, SubscriptionPlan> = {
  WEEK: 'WEEKLY',
  MONTH: 'MONTHLY',
  YEAR: 'YEARLY',
};

const STATUS_BY_STATE: Record<SubscriptionState, SubscriptionStatus> = {
  active: 'ACTIVE',
  cancelled: 'CANCELED',
  grace: 'IN_GRACE',
  on_hold: 'ON_HOLD',
  paused: 'PAUSED',
  expired: 'EXPIRED',
  pending: 'ON_HOLD',
};

/**
 * Paiements Google Play (§10, S07-BE-06/07) : vérification serveur par le port `PurchaseVerifier`,
 * crédit par le grand livre (idempotent par `purchases.purchase_token`), acquittement après crédit,
 * abonnements VIP (`subscriptions` + `users.vip_expires_at`), RTDN (renouvellement, annulation,
 * remboursement, pause). Mobile money : `topup/` (S09-BE-01).
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly shop: ShopService,
    private readonly config: AppConfig,
    @Inject(PURCHASE_VERIFIER) private readonly verifier: PurchaseVerifier,
    private readonly offers: OffersService,
  ) {}

  async verifyGooglePurchase(userId: string, dto: GoogleVerifyDto): Promise<VerifyResultDto> {
    return dto.type === 'subs'
      ? this.verifySubscriptionPurchase(userId, dto)
      : this.verifyProductPurchase(userId, dto);
  }

  // ------------------------------------------------------------------ packs

  private async verifyProductPurchase(
    userId: string,
    dto: GoogleVerifyDto,
  ): Promise<VerifyResultDto> {
    const existing = await this.prisma.purchase.findUnique({
      where: { purchaseToken: dto.purchaseToken },
    });
    if (existing && existing.userId !== userId) throw ownedByOther();
    if (existing && isCredited(existing)) {
      await this.acknowledgeProduct(existing);
      return { status: 'already_processed', wallet: await this.wallet.getWallet(userId) };
    }

    const pack = await this.shop.findPackBySku(dto.productId);
    if (!pack) throw invalid('unknown_product');
    const verified = await this.verifier
      .verifyProduct(dto.productId, dto.purchaseToken)
      .catch(rethrowInvalid);
    if (verified.productId !== dto.productId) throw invalid('product_mismatch');
    if (verified.state !== 'purchased') throw invalid(verified.state);

    const { purchase, alreadyCredited } = await this.prisma.$transaction(async (tx) => {
      // Offre de bienvenue (premier achat, fenêtre) et offre limitée du pack, appliquées au crédit (M-24).
      const offerBonus = await this.offers.purchaseBonus(tx, userId, pack.sku, pack.coins);
      const bonusCoins = pack.bonusCoins + offerBonus.extraBonus;
      const inserted = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO purchases (id, user_id, provider, product_id, purchase_token, order_id, currency, coins, bonus_coins, status, raw_payload, verified_at, created_at, updated_at)
        VALUES (gen_random_uuid(), ${userId}::uuid, 'GOOGLE_PLAY', ${dto.productId}, ${dto.purchaseToken}, ${verified.orderId}, ${verified.regionCode ? currencyForCountry(verified.regionCode) : null}, ${pack.coins}, ${bonusCoins}, 'VERIFIED', ${JSON.stringify(verified.raw)}::jsonb, now(), now(), now())
        ON CONFLICT (purchase_token) DO NOTHING
        RETURNING id`;
      const row = await tx.purchase.findUniqueOrThrow({
        where: { purchaseToken: dto.purchaseToken },
      });
      if (row.userId !== userId) throw ownedByOther();
      if (inserted.length === 0 && isCredited(row)) return { purchase: row, alreadyCredited: true };

      await this.wallet.creditPurchase(tx, userId, {
        id: row.id,
        coins: row.coins,
        bonusCoins: row.bonusCoins,
      });
      const credited = await tx.purchase.update({
        where: { id: row.id },
        data: { status: 'CREDITED', creditedAt: new Date() },
      });
      return { purchase: credited, alreadyCredited: false };
    });

    if (!verified.acknowledged) await this.acknowledgeProduct(purchase);
    this.logger.log(
      `Purchase ${purchase.id} (${purchase.productId}) ${alreadyCredited ? 'already credited' : 'credited'} for ${userId}`,
    );
    return {
      status: alreadyCredited ? 'already_processed' : 'credited',
      wallet: await this.wallet.getWallet(userId),
    };
  }

  private async acknowledgeProduct(purchase: Purchase): Promise<void> {
    if (purchase.status === 'ACKNOWLEDGED' || purchase.status === 'REFUNDED') return;
    try {
      await this.verifier.acknowledgeProduct(purchase.productId, purchase.purchaseToken);
      await this.prisma.purchase.update({
        where: { id: purchase.id },
        data: { status: 'ACKNOWLEDGED' },
      });
    } catch (err) {
      // Le crédit est acquis ; l'acquittement sera retenté au prochain appel (sinon Google rembourse).
      this.logger.error(
        `Acknowledge failed for purchase ${purchase.id}: ${(err as Error).message}`,
      );
    }
  }

  // ------------------------------------------------------------------ abonnements

  private async verifySubscriptionPurchase(
    userId: string,
    dto: GoogleVerifyDto,
  ): Promise<VerifyResultDto> {
    const existing = await this.prisma.subscription.findUnique({
      where: { purchaseToken: dto.purchaseToken },
    });
    if (existing && existing.userId !== userId) throw ownedByOther();

    const verified = await this.verifier
      .verifySubscription(dto.purchaseToken)
      .catch(rethrowInvalid);
    const plan = await this.shop.findPlanBySku(verified.productId);
    if (!plan) throw invalid('unknown_product');
    if (verified.state === 'pending') throw invalid('pending');
    if (verified.state === 'expired' && !existing) throw invalid('expired');

    const subscription = await this.prisma.$transaction((tx) =>
      this.applySubscription(tx, userId, dto.purchaseToken, plan, verified),
    );
    if (!verified.acknowledged && ACCESS_GRANTING_STATES.has(verified.state)) {
      try {
        await this.verifier.acknowledgeSubscription(plan.sku, dto.purchaseToken);
      } catch (err) {
        this.logger.error(
          `Acknowledge failed for subscription ${subscription.id}: ${(err as Error).message}`,
        );
      }
    }
    this.logger.log(
      `Subscription ${subscription.id} (${plan.sku}, ${verified.state}) for ${userId}`,
    );
    return { status: 'subscription_active', vip: await this.getSubscription(userId) };
  }

  /** Crée ou met à jour la ligne `subscriptions` du jeton, puis recalcule `users.vip_*`. */
  private async applySubscription(
    tx: Tx,
    userId: string,
    purchaseToken: string,
    plan: VipPlan,
    verified: VerifiedSubscription,
    now = new Date(),
  ): Promise<Subscription> {
    const status = STATUS_BY_STATE[verified.state];
    const startsAt = verified.startTime ?? now;
    const endsAt = verified.expiryTime ?? now;
    const data = {
      plan: PLAN_BY_PERIOD[plan.period],
      productId: plan.sku,
      startsAt,
      endsAt,
      autoRenew: verified.autoRenewing,
      status,
      linkedPurchaseToken: verified.linkedPurchaseToken,
      rawPayload: JSON.parse(JSON.stringify(verified.raw ?? null)) as Prisma.InputJsonValue,
    };
    const subscription = await tx.subscription.upsert({
      where: { purchaseToken },
      create: { userId, provider: 'GOOGLE_PLAY', purchaseToken, ...data },
      update: data,
    });
    if (verified.linkedPurchaseToken) {
      await tx.subscription.updateMany({
        where: { purchaseToken: verified.linkedPurchaseToken, status: { notIn: ['EXPIRED'] } },
        data: { status: 'EXPIRED', endsAt: now, autoRenew: false },
      });
    }
    await this.syncUserVip(tx, userId, now);
    return subscription;
  }

  /** `users.vip_expires_at` = échéance la plus lointaine des abonnements donnant accès ; sinon coupe au présent. */
  async syncUserVip(tx: Tx, userId: string, now = new Date()): Promise<void> {
    const granting = await tx.subscription.findFirst({
      where: { userId, status: { in: ['ACTIVE', 'IN_GRACE', 'CANCELED'] }, endsAt: { gt: now } },
      orderBy: { endsAt: 'desc' },
      select: { endsAt: true },
    });
    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { isVip: true, vipExpiresAt: true },
    });
    if (granting) {
      await tx.user.update({
        where: { id: userId },
        data: { isVip: true, vipExpiresAt: granting.endsAt },
      });
    } else if (user.vipExpiresAt && user.vipExpiresAt > now) {
      await tx.user.update({ where: { id: userId }, data: { vipExpiresAt: now } });
    }
  }

  async getSubscription(userId: string, country?: string | null): Promise<SubscriptionStatusDto> {
    const [sub, user] = await Promise.all([
      this.prisma.subscription.findFirst({
        where: { userId },
        orderBy: [{ endsAt: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.user.findUnique({ where: { id: userId }, select: { country: true } }),
    ]);
    if (!sub) {
      return {
        status: 'none',
        plan: null,
        startedAt: null,
        expiresAt: null,
        autoRenew: false,
        store: 'google',
      };
    }
    const plan = await this.prisma.vipPlan.findUnique({ where: { sku: sub.productId } });
    const currency = currencyForCountry(country ?? user?.country);
    return {
      status: subscriptionLabel(sub),
      plan: plan ? toVipPlanDto(plan, currency) : null,
      startedAt: sub.startsAt.toISOString(),
      expiresAt: sub.endsAt.toISOString(),
      autoRenew: sub.autoRenew,
      store: 'google',
    };
  }

  // ------------------------------------------------------------------ RTDN

  /**
   * Message Pub/Sub des RTDN : contrôle optionnel de `GOOGLE_RTDN_AUTH_TOKEN`, puis traitement
   * idempotent. Répond 204 même pour un message inconnu (sinon Pub/Sub rejoue sans fin) ; une
   * erreur technique (magasin injoignable) remonte en 5xx pour obtenir un nouvel essai.
   */
  async handleGoogleRtdn(body: GoogleRtdnDto, presentedToken?: string): Promise<void> {
    const expected = this.config.billing.rtdnAuthToken;
    if (expected && !safeTokenEquals(expected, presentedToken)) {
      throw new UnauthorizedException({
        code: 'INVALID_WEBHOOK_SIGNATURE',
        message: 'Invalid RTDN token',
      });
    }
    const notification = decodeDeveloperNotification(body.message.data);
    if (!notification) {
      this.logger.warn(`RTDN ${body.message.messageId ?? '?'}: undecodable payload, ignored`);
      return;
    }
    const event = classifyNotification(notification);
    this.logger.log(`RTDN ${body.message.messageId ?? '?'}: ${event.kind}`);
    switch (event.kind) {
      case 'subscription':
        await this.onSubscriptionEvent(event.purchaseToken);
        return;
      case 'voided':
        if (event.productType === 'subs') await this.endSubscription(event.purchaseToken, 'voided');
        else await this.refundPurchaseByToken(event.purchaseToken);
        return;
      case 'one_time':
        if (event.notificationType === ONE_TIME_PRODUCT_CANCELED) {
          await this.refundPurchaseByToken(event.purchaseToken);
        }
        return;
      default:
        return;
    }
  }

  private async onSubscriptionEvent(purchaseToken: string): Promise<void> {
    let verified: VerifiedSubscription;
    try {
      verified = await this.verifier.verifySubscription(purchaseToken);
    } catch (err) {
      if (err instanceof PurchaseVerificationError) {
        this.logger.warn(
          `RTDN subscription ${purchaseToken.slice(0, 12)}…: ${err.reason}, ignored`,
        );
        return;
      }
      throw err;
    }
    const plan = await this.shop.findPlanBySku(verified.productId);
    if (!plan) {
      this.logger.warn(`RTDN subscription for unknown sku ${verified.productId}, ignored`);
      return;
    }
    const existing = await this.prisma.subscription.findUnique({ where: { purchaseToken } });
    let userId = existing?.userId ?? null;
    if (!userId && verified.linkedPurchaseToken) {
      const linked = await this.prisma.subscription.findUnique({
        where: { purchaseToken: verified.linkedPurchaseToken },
        select: { userId: true },
      });
      userId = linked?.userId ?? null;
    }
    if (!userId && verified.obfuscatedAccountId) {
      const user = await this.prisma.user.findUnique({
        where: { id: verified.obfuscatedAccountId },
        select: { id: true },
      });
      userId = user?.id ?? null;
    }
    if (!userId) {
      this.logger.warn(
        `RTDN subscription ${purchaseToken.slice(0, 12)}…: no owner yet (awaiting /billing/google/verify)`,
      );
      return;
    }
    await this.prisma.$transaction((tx) =>
      this.applySubscription(tx, userId, purchaseToken, plan, verified),
    );
  }

  private async endSubscription(purchaseToken: string, reason: string): Promise<void> {
    const sub = await this.prisma.subscription.findUnique({ where: { purchaseToken } });
    if (!sub) return;
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id: sub.id },
        data: { status: 'EXPIRED', endsAt: now, autoRenew: false },
      });
      await this.syncUserVip(tx, sub.userId, now);
    });
    this.logger.log(`Subscription ${sub.id} ended (${reason})`);
  }

  private async refundPurchaseByToken(purchaseToken: string): Promise<void> {
    const purchase = await this.prisma.purchase.findUnique({ where: { purchaseToken } });
    if (!purchase || purchase.status === 'REFUNDED') return;
    if (!isCredited(purchase)) {
      await this.prisma.purchase.update({
        where: { id: purchase.id },
        data: { status: 'REFUNDED' },
      });
      return;
    }
    await this.prisma.$transaction(async (tx) => {
      await this.wallet.refundPurchase(tx, purchase.userId, purchase);
      await tx.purchase.update({ where: { id: purchase.id }, data: { status: 'REFUNDED' } });
    });
    this.logger.log(
      `Purchase ${purchase.id} refunded: ${purchase.coins} coins debited from ${purchase.userId}`,
    );
  }
}

function isCredited(p: Pick<Purchase, 'status'>): boolean {
  return p.status === 'CREDITED' || p.status === 'ACKNOWLEDGED' || p.status === 'REFUNDED';
}

/** Comparaison à temps constant du jeton RTDN (évite une fuite par mesure de temps). */
function safeTokenEquals(expected: string, presented: string | undefined): boolean {
  if (!presented) return false;
  const expectedBuf = Buffer.from(expected);
  const presentedBuf = Buffer.from(presented);
  return expectedBuf.length === presentedBuf.length && timingSafeEqual(expectedBuf, presentedBuf);
}

function invalid(reason: string): BadRequestException {
  return new BadRequestException({
    code: 'PURCHASE_INVALID',
    message: 'Purchase token rejected',
    details: { reason },
  });
}

function ownedByOther(): ConflictException {
  return new ConflictException({
    code: 'PURCHASE_OWNED_BY_OTHER',
    message: 'This purchase token was already consumed by another account',
  });
}

function rethrowInvalid(err: unknown): never {
  if (err instanceof PurchaseVerificationError) throw invalid(err.reason);
  throw err;
}

export function subscriptionLabel(sub: Pick<Subscription, 'status' | 'endsAt'>, now = new Date()) {
  const live = sub.endsAt.getTime() > now.getTime();
  if (!live) return 'expired' as const;
  switch (sub.status) {
    case 'ACTIVE':
      return 'active' as const;
    case 'IN_GRACE':
      return 'grace' as const;
    case 'CANCELED':
      return 'cancelled' as const;
    default:
      return 'expired' as const;
  }
}
