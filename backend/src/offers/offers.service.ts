import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AuditService, diffChanges } from '../admin/audit/audit.service.js';
import { type AuthenticatedAdmin } from '../common/request-context.js';
import { type LimitedOffer, Prisma, type PromoCode } from '../generated/prisma/client.js';
import {
  MonetizationSettingsService,
  SETTINGS_ID,
} from '../monetization/monetization-settings.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { WalletService } from '../wallet/wallet.service.js';
import {
  type CreateLimitedOfferDto,
  type CreatePromoCodeDto,
  type LimitedOfferAdminDto,
  type LimitedOfferDto,
  type OffersDto,
  type PromoCodeAdminDto,
  type PromoRedemptionsDto,
  type RedeemPromoResultDto,
  type UpdateLimitedOfferDto,
  type UpdatePromoCodeDto,
  type WelcomeOfferDto,
  type WelcomeOfferSettingsDto,
} from './dto/offers.dto.js';

type Tx = Prisma.TransactionClient;

export interface WelcomeOfferRules {
  isActive: boolean;
  packSku: string | null;
  bonusPercent: number;
  hours: number;
}

/** Pourcentages de bonus applicables à un achat (offre de bienvenue + offre limitée du pack). */
export interface PurchaseBonus {
  welcomePercent: number;
  limitedPercent: number;
  /** Pièces bonus supplémentaires pour `coins` pièces achetées (arrondi au supérieur). */
  extraBonus: number;
}

const WELCOME_FIELDS = ['isActive', 'packSku', 'bonusPercent', 'hours'] as const;
const LIMITED_FIELDS = [
  'title',
  'packSku',
  'bonusPercent',
  'startsAt',
  'endsAt',
  'isActive',
] as const;
const PROMO_FIELDS = ['coins', 'maxUses', 'perUserUses', 'startsAt', 'endsAt', 'isActive'] as const;

/**
 * Offres (M-24, B-07, S10-BE-03) : offre de bienvenue (bonus % sur le premier achat, fenêtre après
 * la création du compte), offres limitées (bonus % sur un pack pendant une période) et codes promo
 * (crédit BONUS par `WalletService.creditBonus`, compteurs d'utilisation, limite par compte).
 * Les pourcentages sont appliqués côté serveur au crédit de l'achat (Google Play et mobile money).
 */
@Injectable()
export class OffersService {
  private readonly logger = new Logger(OffersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly settings: MonetizationSettingsService,
    private readonly audit: AuditService,
  ) {}

  // ------------------------------------------------------------------ app

  async getOffers(userId: string, now = new Date()): Promise<OffersDto> {
    const [welcome, limited] = await Promise.all([
      this.welcomeFor(userId, now),
      this.activeLimitedOffers(now),
    ]);
    return { welcome, limited: limited.map(toLimitedOfferDto) };
  }

  /** Offre de bienvenue applicable au compte : active, dans la fenêtre, aucun achat crédité. */
  async welcomeFor(
    userId: string,
    now = new Date(),
    tx: Tx | PrismaService = this.prisma,
  ): Promise<WelcomeOfferDto | null> {
    const rules = await this.welcomeRules();
    if (!rules.isActive || rules.bonusPercent <= 0) return null;
    const user = await tx.user.findUnique({ where: { id: userId }, select: { createdAt: true } });
    if (!user) return null;
    const expiresAt = welcomeExpiry(user.createdAt, rules.hours);
    if (expiresAt.getTime() <= now.getTime()) return null;
    if (await this.hasCreditedPurchase(userId, tx)) return null;
    return {
      packSku: rules.packSku,
      bonusPercent: rules.bonusPercent,
      expiresAt: expiresAt.toISOString(),
    };
  }

  /**
   * Bonus à ajouter au crédit d'un pack (appelé dans la transaction de crédit, S07-BE-06 et S09-BE-01) :
   * offre de bienvenue si le pack correspond et que c'est le premier achat, plus l'offre limitée active du pack.
   */
  async purchaseBonus(
    tx: Tx,
    userId: string,
    packSku: string,
    coins: number,
    now = new Date(),
  ): Promise<PurchaseBonus> {
    const welcome = await this.welcomeFor(userId, now, tx);
    const welcomePercent =
      welcome && (welcome.packSku === null || welcome.packSku === packSku)
        ? welcome.bonusPercent
        : 0;
    const limited = (await this.activeLimitedOffers(now, tx)).filter((o) => o.packSku === packSku);
    const limitedPercent = limited.reduce((max, o) => Math.max(max, o.bonusPercent), 0);
    return {
      welcomePercent,
      limitedPercent,
      extraBonus: extraBonusFor(coins, welcomePercent + limitedPercent),
    };
  }

  async redeemPromo(
    userId: string,
    rawCode: string,
    idempotencyKey: string,
    now = new Date(),
  ): Promise<RedeemPromoResultDto> {
    const code = normalizeCode(rawCode);
    const result = await this.prisma.$transaction(async (tx) => {
      const replay = await tx.promoRedemption.findUnique({
        where: { userId_idempotencyKey: { userId, idempotencyKey } },
        include: { promoCode: { select: { code: true } } },
      });
      if (replay) {
        if (replay.promoCode.code !== code) throw promoInvalid();
        return { coins: replay.coins, replay: true };
      }
      const rows = await tx.$queryRaw<
        PromoCode[]
      >`SELECT * FROM promo_codes WHERE code = ${code} FOR UPDATE`;
      const promo = rows[0] ? mapPromoRow(rows[0]) : null;
      if (!promo || !promo.isActive) throw promoInvalid();
      if (promo.startsAt && promo.startsAt > now) throw promoInvalid();
      if (promo.endsAt && promo.endsAt <= now)
        throw promoConflict('PROMO_EXPIRED', 'Promo code expired');
      if (promo.maxUses !== null && promo.usesCount >= promo.maxUses) {
        throw promoConflict('PROMO_EXHAUSTED', 'Promo code fully used');
      }
      const mine = await tx.promoRedemption.count({ where: { promoCodeId: promo.id, userId } });
      if (mine >= promo.perUserUses)
        throw promoConflict('PROMO_ALREADY_USED', 'Promo code already used by this account');

      const redemption = await tx.promoRedemption.create({
        data: { promoCodeId: promo.id, userId, coins: promo.coins, idempotencyKey },
      });
      await tx.promoCode.update({ where: { id: promo.id }, data: { usesCount: { increment: 1 } } });
      await this.wallet.creditBonus(
        tx,
        userId,
        {
          amount: promo.coins,
          referenceType: 'promo_code',
          referenceId: redemption.id,
          idempotencyKey: `promo:${redemption.id}`,
          note: `Promo code ${promo.code}`,
        },
        now,
      );
      return { coins: promo.coins, replay: false };
    });
    if (!result.replay) this.logger.log(`Promo ${code} redeemed by ${userId}: +${result.coins}`);
    return { coins: result.coins, wallet: await this.wallet.getWallet(userId, now) };
  }

  // ------------------------------------------------------------------ admin : offre de bienvenue

  async welcomeRules(): Promise<WelcomeOfferRules> {
    const s = await this.settings.get();
    return {
      isActive: s.welcomeOfferActive,
      packSku: s.welcomeOfferPackSku,
      bonusPercent: s.welcomeOfferBonusPercent,
      hours: s.welcomeOfferHours,
    };
  }

  async updateWelcome(
    dto: WelcomeOfferSettingsDto,
    admin: AuthenticatedAdmin,
    ip?: string,
  ): Promise<WelcomeOfferRules> {
    const before = await this.welcomeRules();
    await this.prisma.$transaction(async (tx) => {
      await tx.monetizationSettings.update({
        where: { id: SETTINGS_ID },
        data: {
          welcomeOfferActive: dto.isActive,
          welcomeOfferPackSku: dto.packSku,
          welcomeOfferBonusPercent: dto.bonusPercent,
          welcomeOfferHours: dto.hours,
        },
      });
      const { oldValue, newValue, changed } = diffChanges(
        before as unknown as Record<string, unknown>,
        dto as unknown as Record<string, unknown>,
        WELCOME_FIELDS,
      );
      if (changed.length > 0) {
        await this.audit.record(
          {
            actor: admin,
            action: 'welcome_offer.update',
            targetType: 'monetization_settings',
            targetId: SETTINGS_ID,
            oldValue,
            newValue,
            ip,
          },
          tx,
        );
      }
    });
    this.settings.invalidate();
    return {
      isActive: dto.isActive,
      packSku: dto.packSku,
      bonusPercent: dto.bonusPercent,
      hours: dto.hours,
    };
  }

  // ------------------------------------------------------------------ admin : offres limitées

  async listLimited(): Promise<LimitedOfferAdminDto[]> {
    const rows = await this.prisma.limitedOffer.findMany({ orderBy: [{ startsAt: 'desc' }] });
    return rows.map(toLimitedOfferAdminDto);
  }

  async createLimited(
    dto: CreateLimitedOfferDto,
    admin: AuthenticatedAdmin,
    ip?: string,
  ): Promise<LimitedOfferAdminDto> {
    assertWindow(dto.startsAt, dto.endsAt);
    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.limitedOffer.create({
        data: {
          title: dto.title,
          packSku: dto.packSku,
          bonusPercent: dto.bonusPercent,
          startsAt: new Date(dto.startsAt),
          endsAt: new Date(dto.endsAt),
          isActive: dto.isActive ?? true,
        },
      });
      await this.audit.record(
        {
          actor: admin,
          action: 'limited_offer.create',
          targetType: 'limited_offer',
          targetId: row.id,
          newValue: pickLimited(row),
          ip,
        },
        tx,
      );
      return row;
    });
    return toLimitedOfferAdminDto(created);
  }

  async updateLimited(
    id: string,
    dto: UpdateLimitedOfferDto,
    admin: AuthenticatedAdmin,
    ip?: string,
  ): Promise<LimitedOfferAdminDto> {
    const before = await this.prisma.limitedOffer.findUnique({ where: { id } });
    if (!before)
      throw new NotFoundException({ code: 'OFFER_NOT_FOUND', message: 'Limited offer not found' });
    const startsAt = dto.startsAt ?? before.startsAt.toISOString();
    const endsAt = dto.endsAt ?? before.endsAt.toISOString();
    assertWindow(startsAt, endsAt);
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.limitedOffer.update({
        where: { id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.packSku !== undefined ? { packSku: dto.packSku } : {}),
          ...(dto.bonusPercent !== undefined ? { bonusPercent: dto.bonusPercent } : {}),
          ...(dto.startsAt !== undefined ? { startsAt: new Date(dto.startsAt) } : {}),
          ...(dto.endsAt !== undefined ? { endsAt: new Date(dto.endsAt) } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      });
      const { oldValue, newValue, changed } = diffChanges(
        pickLimited(before),
        pickLimited(row),
        LIMITED_FIELDS,
      );
      if (changed.length > 0) {
        await this.audit.record(
          {
            actor: admin,
            action: 'limited_offer.update',
            targetType: 'limited_offer',
            targetId: id,
            oldValue,
            newValue,
            ip,
          },
          tx,
        );
      }
      return row;
    });
    return toLimitedOfferAdminDto(updated);
  }

  async deleteLimited(id: string, admin: AuthenticatedAdmin, ip?: string): Promise<void> {
    const before = await this.prisma.limitedOffer.findUnique({ where: { id } });
    if (!before)
      throw new NotFoundException({ code: 'OFFER_NOT_FOUND', message: 'Limited offer not found' });
    await this.prisma.$transaction(async (tx) => {
      await tx.limitedOffer.delete({ where: { id } });
      await this.audit.record(
        {
          actor: admin,
          action: 'limited_offer.delete',
          targetType: 'limited_offer',
          targetId: id,
          oldValue: pickLimited(before),
          ip,
        },
        tx,
      );
    });
  }

  // ------------------------------------------------------------------ admin : codes promo

  async listPromoCodes(): Promise<PromoCodeAdminDto[]> {
    const rows = await this.prisma.promoCode.findMany({ orderBy: { createdAt: 'desc' } });
    return rows.map(toPromoCodeDto);
  }

  async createPromoCode(
    dto: CreatePromoCodeDto,
    admin: AuthenticatedAdmin,
    ip?: string,
  ): Promise<PromoCodeAdminDto> {
    const code = normalizeCode(dto.code);
    if (dto.startsAt && dto.endsAt) assertWindow(dto.startsAt, dto.endsAt);
    if (await this.prisma.promoCode.findUnique({ where: { code }, select: { id: true } })) {
      throw new ConflictException({
        code: 'PROMO_CODE_TAKEN',
        message: 'Promo code already exists',
      });
    }
    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.promoCode.create({
        data: {
          code,
          coins: dto.coins,
          maxUses: dto.maxUses ?? null,
          perUserUses: dto.perUserUses ?? 1,
          startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
          endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
          isActive: dto.isActive ?? true,
        },
      });
      await this.audit.record(
        {
          actor: admin,
          action: 'promo_code.create',
          targetType: 'promo_code',
          targetId: row.id,
          newValue: pickPromo(row),
          ip,
        },
        tx,
      );
      return row;
    });
    return toPromoCodeDto(created);
  }

  async updatePromoCode(
    id: string,
    dto: UpdatePromoCodeDto,
    admin: AuthenticatedAdmin,
    ip?: string,
  ): Promise<PromoCodeAdminDto> {
    const before = await this.prisma.promoCode.findUnique({ where: { id } });
    if (!before)
      throw new NotFoundException({ code: 'PROMO_NOT_FOUND', message: 'Promo code not found' });
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.promoCode.update({
        where: { id },
        data: {
          ...(dto.coins !== undefined ? { coins: dto.coins } : {}),
          ...(dto.maxUses !== undefined ? { maxUses: dto.maxUses } : {}),
          ...(dto.perUserUses !== undefined ? { perUserUses: dto.perUserUses } : {}),
          ...(dto.startsAt !== undefined
            ? { startsAt: dto.startsAt ? new Date(dto.startsAt) : null }
            : {}),
          ...(dto.endsAt !== undefined ? { endsAt: dto.endsAt ? new Date(dto.endsAt) : null } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      });
      const { oldValue, newValue, changed } = diffChanges(
        pickPromo(before),
        pickPromo(row),
        PROMO_FIELDS,
      );
      if (changed.length > 0) {
        await this.audit.record(
          {
            actor: admin,
            action: 'promo_code.update',
            targetType: 'promo_code',
            targetId: id,
            oldValue,
            newValue,
            ip,
          },
          tx,
        );
      }
      return row;
    });
    return toPromoCodeDto(updated);
  }

  async listRedemptions(id: string): Promise<PromoRedemptionsDto> {
    const promo = await this.prisma.promoCode.findUnique({ where: { id }, select: { id: true } });
    if (!promo)
      throw new NotFoundException({ code: 'PROMO_NOT_FOUND', message: 'Promo code not found' });
    const [rows, total] = await Promise.all([
      this.prisma.promoRedemption.findMany({
        where: { promoCodeId: id },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      this.prisma.promoRedemption.count({ where: { promoCodeId: id } }),
    ]);
    return {
      items: rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        coins: r.coins,
        createdAt: r.createdAt.toISOString(),
      })),
      total,
    };
  }

  // ------------------------------------------------------------------ interne

  private activeLimitedOffers(
    now: Date,
    tx: Tx | PrismaService = this.prisma,
  ): Promise<LimitedOffer[]> {
    return tx.limitedOffer.findMany({
      where: { isActive: true, startsAt: { lte: now }, endsAt: { gt: now } },
      orderBy: { endsAt: 'asc' },
    });
  }

  /** Premier achat = aucun achat crédité (Google Play ou mobile money) sur le compte. */
  private async hasCreditedPurchase(userId: string, tx: Tx | PrismaService): Promise<boolean> {
    const n = await tx.purchase.count({
      where: { userId, status: { in: ['CREDITED', 'ACKNOWLEDGED', 'REFUNDED'] } },
    });
    return n > 0;
  }
}

export function welcomeExpiry(createdAt: Date, hours: number): Date {
  return new Date(createdAt.getTime() + hours * 3_600_000);
}

/** Bonus supplémentaire pour `coins` pièces et un pourcentage cumulé, arrondi au supérieur. */
export function extraBonusFor(coins: number, percent: number): number {
  if (coins <= 0 || percent <= 0) return 0;
  return Math.ceil((coins * percent) / 100);
}

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

function promoInvalid(): HttpException {
  return new NotFoundException({
    code: 'PROMO_INVALID',
    message: 'Unknown or inactive promo code',
  });
}

function promoConflict(code: string, message: string): HttpException {
  return new HttpException({ code, message }, HttpStatus.CONFLICT);
}

function assertWindow(startsAt: string, endsAt: string): void {
  if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
    throw new HttpException(
      { code: 'VALIDATION_ERROR', message: 'endsAt must be after startsAt' },
      HttpStatus.BAD_REQUEST,
    );
  }
}

/** Ligne brute de `SELECT * … FOR UPDATE` (colonnes snake_case) vers le modèle. */
function mapPromoRow(row: Record<string, unknown>): PromoCode {
  const r = row as Record<string, never>;
  return {
    id: r['id'],
    code: r['code'],
    coins: r['coins'],
    maxUses: r['max_uses'] ?? null,
    perUserUses: r['per_user_uses'],
    usesCount: r['uses_count'],
    startsAt: r['starts_at'] ?? null,
    endsAt: r['ends_at'] ?? null,
    isActive: r['is_active'],
    createdAt: r['created_at'],
    updatedAt: r['updated_at'],
  };
}

export function toLimitedOfferDto(o: LimitedOffer): LimitedOfferDto {
  return {
    id: o.id,
    title: o.title,
    packSku: o.packSku,
    bonusPercent: o.bonusPercent,
    endsAt: o.endsAt.toISOString(),
  };
}

export function toLimitedOfferAdminDto(o: LimitedOffer): LimitedOfferAdminDto {
  return {
    ...toLimitedOfferDto(o),
    startsAt: o.startsAt.toISOString(),
    isActive: o.isActive,
    createdAt: o.createdAt.toISOString(),
  };
}

export function toPromoCodeDto(p: PromoCode): PromoCodeAdminDto {
  return {
    id: p.id,
    code: p.code,
    coins: p.coins,
    maxUses: p.maxUses,
    perUserUses: p.perUserUses,
    usesCount: p.usesCount,
    startsAt: p.startsAt?.toISOString() ?? null,
    endsAt: p.endsAt?.toISOString() ?? null,
    isActive: p.isActive,
    createdAt: p.createdAt.toISOString(),
  };
}

function pickLimited(o: LimitedOffer): Record<string, unknown> {
  return {
    title: o.title,
    packSku: o.packSku,
    bonusPercent: o.bonusPercent,
    startsAt: o.startsAt.toISOString(),
    endsAt: o.endsAt.toISOString(),
    isActive: o.isActive,
  };
}

function pickPromo(p: PromoCode): Record<string, unknown> {
  return {
    code: p.code,
    coins: p.coins,
    maxUses: p.maxUses,
    perUserUses: p.perUserUses,
    startsAt: p.startsAt?.toISOString() ?? null,
    endsAt: p.endsAt?.toISOString() ?? null,
    isActive: p.isActive,
  };
}
