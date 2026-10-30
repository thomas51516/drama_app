import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { currencyForCountry, parsePrices, resolvePrice } from '../common/money/currency.js';
import { AppConfig } from '../config/app-config.js';
import { Prisma, type TopupOrder } from '../generated/prisma/client.js';
import { ShopService } from '../monetization/shop.service.js';
import { OffersService } from '../offers/offers.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { WalletService } from '../wallet/wallet.service.js';
import {
  type CreateTopupOrderDto,
  type TopupOrderCreatedDto,
  type TopupOrderDto,
  type TopupOrdersDto,
  type TopupOrdersQueryDto,
} from './dto/topup.dto.js';
import {
  FakeMobileMoneyProvider,
  FAKE_SIGNATURE_HEADER,
} from './provider/fake-mobile-money.provider.js';
import {
  MOBILE_MONEY_PROVIDER,
  type MobileMoneyProvider,
  PaymentProviderError,
  type WebhookEvent,
  type WebhookInput,
  WebhookSignatureError,
} from './provider/mobile-money-provider.js';

export const TOPUP_ORDER_TTL_MS = 60 * 60_000;

export type WebhookApplied = 'credited' | 'already_credited' | 'failed' | 'ignored';

/**
 * Recharge mobile money (M-34, §10, S09-BE-01/02) : commande au prix de la boutique dans la devise
 * du pays, URL de paiement de l'agrégateur, crédit UNIQUEMENT sur webhook signé (ligne PURCHASE +
 * BONUS du pack + offres de bienvenue / limitées, via `WalletService.creditPurchase`), idempotent par
 * commande et par `providerReference`. Les commandes PENDING expirent après 1 h (tâche planifiée).
 */
@Injectable()
export class TopupService {
  private readonly logger = new Logger(TopupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly shop: ShopService,
    private readonly offers: OffersService,
    private readonly config: AppConfig,
    @Inject(MOBILE_MONEY_PROVIDER) private readonly provider: MobileMoneyProvider,
  ) {}

  get providerName(): MobileMoneyProvider['name'] {
    return this.provider.name;
  }

  // ------------------------------------------------------------------ commandes

  async createOrder(
    userId: string,
    dto: CreateTopupOrderDto,
    now = new Date(),
  ): Promise<TopupOrderCreatedDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { status: true },
    });
    if (!user || (user.status !== 'ACTIVE' && user.status !== 'DELETION_PENDING')) {
      throw new ForbiddenException({ code: 'USER_BLOCKED', message: 'Account is not active' });
    }
    const existing = await this.prisma.topupOrder.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey: dto.idempotencyKey } },
    });
    if (existing) return toCreatedDto(existing);

    const pack = await this.shop.findPackBySku(dto.packSku);
    if (!pack || !pack.isActive) {
      throw new NotFoundException({
        code: 'PACK_NOT_FOUND',
        message: 'Unknown or inactive coin pack',
      });
    }
    const country = dto.country.toUpperCase();
    const currency = currencyForCountry(country);
    const price = resolvePrice(parsePrices(pack.prices), currency);
    if (!price) {
      throw new BadRequestException({
        code: 'PACK_UNAVAILABLE',
        message: 'No price for this country',
      });
    }

    let order: TopupOrder;
    try {
      order = await this.prisma.topupOrder.create({
        data: {
          userId,
          packSku: pack.sku,
          coins: pack.coins,
          bonusCoins: pack.bonusCoins,
          currency: price.currency,
          amountMinor: price.amountMinor,
          country,
          phone: dto.phone ?? null,
          provider: this.provider.name,
          idempotencyKey: dto.idempotencyKey,
          expiresAt: new Date(now.getTime() + TOPUP_ORDER_TTL_MS),
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const raced = await this.prisma.topupOrder.findUniqueOrThrow({
          where: { userId_idempotencyKey: { userId, idempotencyKey: dto.idempotencyKey } },
        });
        return toCreatedDto(raced);
      }
      throw err;
    }

    try {
      const init = await this.provider.createPayment({
        id: order.id,
        userId,
        packSku: order.packSku,
        coins: order.coins,
        currency: order.currency,
        amountMinor: order.amountMinor,
        country: order.country,
        phone: order.phone,
      });
      order = await this.prisma.topupOrder.update({
        where: { id: order.id },
        data: {
          paymentUrl: init.paymentUrl,
          providerReference: init.providerReference,
          rawPayload: init.raw === undefined ? undefined : toJson(init.raw),
        },
      });
    } catch (err) {
      await this.prisma.topupOrder.update({ where: { id: order.id }, data: { status: 'FAILED' } });
      const reason = err instanceof PaymentProviderError ? err.reason : 'unknown';
      this.logger.error(
        `Top-up ${order.id}: payment init failed (${reason}): ${(err as Error).message}`,
      );
      throw new HttpException(
        {
          code: 'PAYMENT_PROVIDER_ERROR',
          message: 'Payment could not be initialised',
          details: { reason },
        },
        HttpStatus.BAD_GATEWAY,
      );
    }
    this.logger.log(
      `Top-up ${order.id} created for ${userId}: ${order.packSku} ${order.amountMinor} ${order.currency}`,
    );
    return toCreatedDto(order);
  }

  async getOrder(userId: string, orderId: string, now = new Date()): Promise<TopupOrderDto> {
    const order = await this.prisma.topupOrder.findFirst({ where: { id: orderId, userId } });
    if (!order)
      throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Top-up order not found' });
    return toOrderDto(order, now);
  }

  async listOrders(
    userId: string,
    query: TopupOrdersQueryDto,
    now = new Date(),
  ): Promise<TopupOrdersDto> {
    const [rows, total] = await Promise.all([
      this.prisma.topupOrder.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.topupOrder.count({ where: { userId } }),
    ]);
    return {
      items: rows.map((o) => toOrderDto(o, now)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /** Commande brute pour la page simulée (sans contrôle de propriétaire : l'URL est le secret partagé). */
  async findOrder(orderId: string): Promise<TopupOrder | null> {
    return this.prisma.topupOrder.findUnique({ where: { id: orderId } });
  }

  // ------------------------------------------------------------------ webhook

  async handleWebhook(
    providerName: string,
    input: WebhookInput,
    now = new Date(),
  ): Promise<WebhookApplied> {
    if (providerName !== this.provider.name) {
      throw new NotFoundException({
        code: 'UNKNOWN_PROVIDER',
        message: `No mobile money provider '${providerName}'`,
      });
    }
    let event: WebhookEvent;
    try {
      event = await this.provider.parseWebhook(input);
    } catch (err) {
      if (err instanceof WebhookSignatureError) {
        this.logger.warn(`Mobile money webhook rejected: ${err.message}`);
        throw new UnauthorizedException({
          code: 'INVALID_WEBHOOK_SIGNATURE',
          message: err.message,
        });
      }
      throw err;
    }
    return this.applyEvent(event, now);
  }

  /** Applique un événement vérifié : PAID + crédit (une seule fois), FAILED, ou ignoré. */
  async applyEvent(event: WebhookEvent, now = new Date()): Promise<WebhookApplied> {
    if (!event.orderId || !isUuid(event.orderId)) {
      this.logger.warn(
        `Mobile money webhook without a known order (${event.providerReference}), ignored`,
      );
      return 'ignored';
    }
    if (event.status === 'pending') return 'ignored';

    const result = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM topup_orders WHERE id = ${event.orderId}::uuid FOR UPDATE`;
      if (rows.length === 0) return 'ignored' as const;
      const order = await tx.topupOrder.findUniqueOrThrow({ where: { id: event.orderId! } });
      if (order.status === 'PAID') return 'already_credited' as const;
      const referenceTaken = await tx.topupOrder.findFirst({
        where: { providerReference: event.providerReference, NOT: { id: order.id } },
        select: { id: true },
      });
      if (referenceTaken) {
        this.logger.warn(
          `Provider reference ${event.providerReference} already used by order ${referenceTaken.id}, ignored`,
        );
        return 'ignored' as const;
      }
      if (event.status === 'failed') {
        if (order.status === 'PENDING') {
          await tx.topupOrder.update({
            where: { id: order.id },
            data: {
              status: 'FAILED',
              providerReference: event.providerReference,
              rawPayload: toJson(event.raw),
            },
          });
        }
        return 'failed' as const;
      }
      if (
        event.amountMinor !== null &&
        event.currency &&
        (event.amountMinor !== order.amountMinor || event.currency !== order.currency)
      ) {
        this.logger.error(
          `Top-up ${order.id}: amount mismatch (expected ${order.amountMinor} ${order.currency}, got ${event.amountMinor} ${event.currency})`,
        );
      }

      const bonus = await this.offers.purchaseBonus(
        tx,
        order.userId,
        order.packSku,
        order.coins,
        now,
      );
      const bonusCoins = order.bonusCoins + bonus.extraBonus;
      const purchaseToken = `topup:${order.id}`;
      await tx.$executeRaw`
        INSERT INTO purchases (id, user_id, provider, product_id, purchase_token, order_id, amount_minor, currency, coins, bonus_coins, status, raw_payload, verified_at, created_at, updated_at)
        VALUES (gen_random_uuid(), ${order.userId}::uuid, 'MOBILE_MONEY', ${order.packSku}, ${purchaseToken}, ${event.providerReference}, ${order.amountMinor}, ${order.currency}, ${order.coins}, ${bonusCoins}, 'VERIFIED', ${JSON.stringify(event.raw ?? null)}::jsonb, now(), now(), now())
        ON CONFLICT (purchase_token) DO NOTHING`;
      const purchase = await tx.purchase.findUniqueOrThrow({ where: { purchaseToken } });
      await this.wallet.creditPurchase(
        tx,
        order.userId,
        { id: purchase.id, coins: purchase.coins, bonusCoins: purchase.bonusCoins },
        now,
      );
      await tx.purchase.update({
        where: { id: purchase.id },
        data: { status: 'CREDITED', creditedAt: now },
      });
      await tx.topupOrder.update({
        where: { id: order.id },
        data: {
          status: 'PAID',
          bonusCoins,
          providerReference: event.providerReference,
          purchaseId: purchase.id,
          rawPayload: toJson(event.raw),
          paidAt: now,
          creditedAt: now,
        },
      });
      return 'credited' as const;
    });
    if (result === 'credited')
      this.logger.log(`Top-up ${event.orderId} paid (${event.providerReference}): wallet credited`);
    return result;
  }

  /** Page simulée : construit et signe le webhook `fake`, puis le traite par le même chemin que l'agrégateur. */
  async simulateFakePayment(
    orderId: string,
    outcome: 'paid' | 'failed',
    now = new Date(),
  ): Promise<WebhookApplied> {
    if (!(this.provider instanceof FakeMobileMoneyProvider)) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Fake payment page is only available with the fake provider',
      });
    }
    const body = { orderId, reference: `fake:${orderId}:${outcome}`, status: outcome };
    const rawBody = JSON.stringify(body);
    return this.handleWebhook(
      'fake',
      { rawBody, headers: { [FAKE_SIGNATURE_HEADER]: this.provider.sign(rawBody) }, body },
      now,
    );
  }

  fakePageAvailable(): boolean {
    return this.provider instanceof FakeMobileMoneyProvider;
  }

  // ------------------------------------------------------------------ tâches planifiées

  /** Commandes PENDING au-delà de leur échéance → EXPIRED. */
  async expirePending(now = new Date()): Promise<number> {
    const { count } = await this.prisma.topupOrder.updateMany({
      where: { status: 'PENDING', expiresAt: { lt: now } },
      data: { status: 'EXPIRED' },
    });
    if (count > 0) this.logger.log(`Expired ${count} pending top-up order(s)`);
    return count;
  }
}

export function toCreatedDto(o: TopupOrder): TopupOrderCreatedDto {
  return {
    orderId: o.id,
    amount: {
      currency: o.currency as TopupOrderCreatedDto['amount']['currency'],
      amountMinor: o.amountMinor,
    },
    paymentUrl: o.paymentUrl ?? '',
    expiresAt: o.expiresAt.toISOString(),
  };
}

export function toOrderDto(o: TopupOrder, now = new Date()): TopupOrderDto {
  const status =
    o.status === 'PENDING' && o.expiresAt.getTime() < now.getTime() ? 'EXPIRED' : o.status;
  return {
    orderId: o.id,
    status,
    packSku: o.packSku,
    coins: o.coins,
    bonusCoins: o.bonusCoins,
    amount: {
      currency: o.currency as TopupOrderDto['amount']['currency'],
      amountMinor: o.amountMinor,
    },
    paymentUrl: status === 'PENDING' ? o.paymentUrl : null,
    creditedAt: o.creditedAt?.toISOString() ?? null,
    expiresAt: o.expiresAt.toISOString(),
    createdAt: o.createdAt.toISOString(),
  };
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
