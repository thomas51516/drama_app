import { Injectable } from '@nestjs/common';
import {
  type Currency,
  currencyForCountry,
  parsePrices,
  resolvePrice,
} from '../common/money/currency.js';
import { type CoinPack, type VipPlan } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { type CoinPackDto, type ShopDto, type VipPlanDto } from './dto/monetization.dto.js';

/** Boutique (M-30, S07-BE-06) : packs et formules actifs, prix dans la devise du pays (repli USD). */
@Injectable()
export class ShopService {
  constructor(private readonly prisma: PrismaService) {}

  async getShop(country: string | null | undefined): Promise<ShopDto> {
    const currency = currencyForCountry(country);
    const [packs, plans] = await Promise.all([
      this.prisma.coinPack.findMany({
        where: { isActive: true },
        orderBy: [{ position: 'asc' }, { coins: 'asc' }],
      }),
      this.prisma.vipPlan.findMany({
        where: { isActive: true },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      }),
    ]);
    return {
      currency,
      coinPacks: packs.flatMap((p) => toCoinPackDto(p, currency) ?? []),
      vipPlans: plans.flatMap((p) => toVipPlanDto(p, currency) ?? []),
      welcomeOffer: null,
    };
  }

  findPackBySku(sku: string): Promise<CoinPack | null> {
    return this.prisma.coinPack.findUnique({ where: { sku } });
  }

  findPlanBySku(sku: string): Promise<VipPlan | null> {
    return this.prisma.vipPlan.findUnique({ where: { sku } });
  }
}

/** `null` quand aucun prix n'existe ni dans la devise ni en USD (le pack est alors masqué). */
export function toCoinPackDto(p: CoinPack, currency: Currency): CoinPackDto | null {
  const price = resolvePrice(parsePrices(p.prices), currency);
  if (!price) return null;
  return {
    id: p.id,
    sku: p.sku,
    coins: p.coins,
    bonusCoins: p.bonusCoins,
    price,
    badge: p.badge,
    position: p.position,
  };
}

export function toVipPlanDto(p: VipPlan, currency: Currency): VipPlanDto | null {
  const price = resolvePrice(parsePrices(p.prices), currency);
  if (!price) return null;
  return {
    id: p.id,
    sku: p.sku,
    period: p.period,
    price,
    trialDays: p.trialDays,
    badge: p.badge,
  };
}
