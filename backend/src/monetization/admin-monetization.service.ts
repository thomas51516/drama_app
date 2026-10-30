import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService, diffChanges } from '../admin/audit/audit.service.js';
import { FALLBACK_CURRENCY, parsePrices } from '../common/money/currency.js';
import { type AuthenticatedAdmin } from '../common/request-context.js';
import { type CoinPack, type Prisma, type VipPlan } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  type CoinPackAdminDto,
  type CreateCoinPackDto,
  type CreateVipPlanDto,
  type PriceDto,
  type UpdateCoinPackDto,
  type UpdateVipPlanDto,
  type VipPlanAdminDto,
} from './dto/monetization.dto.js';

const PACK_FIELDS = ['coins', 'bonusCoins', 'prices', 'badge', 'position', 'isActive'] as const;
const PLAN_FIELDS = ['period', 'prices', 'trialDays', 'badge', 'position', 'isActive'] as const;

/** Packs de pièces et formules VIP (B-06, contrat v1.4). Rôles MONETIZATION et ADMIN ; tout est audité. */
@Injectable()
export class AdminMonetizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ------------------------------------------------------------------ packs

  async listPacks(): Promise<CoinPackAdminDto[]> {
    const packs = await this.prisma.coinPack.findMany({
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
    return packs.map(toCoinPackAdmin);
  }

  async createPack(dto: CreateCoinPackDto, admin: AuthenticatedAdmin, ip?: string) {
    if (await this.prisma.coinPack.findUnique({ where: { sku: dto.sku }, select: { id: true } })) {
      throw new ConflictException({ code: 'SKU_TAKEN', message: 'A pack with this sku exists' });
    }
    const created = await this.prisma.$transaction(async (tx) => {
      const pack = await tx.coinPack.create({
        data: {
          sku: dto.sku,
          coins: dto.coins,
          bonusCoins: dto.bonusCoins ?? 0,
          prices: normalizePrices(dto.prices) as unknown as Prisma.InputJsonValue,
          badge: dto.badge ?? null,
          position: dto.position ?? (await nextPosition(tx.coinPack)),
          isActive: dto.isActive ?? true,
        },
      });
      await this.audit.record(
        {
          actor: admin,
          action: 'coin_pack.create',
          targetType: 'coin_pack',
          targetId: pack.id,
          newValue: pickPack(pack),
          ip,
        },
        tx,
      );
      return pack;
    });
    return toCoinPackAdmin(created);
  }

  async updatePack(id: string, dto: UpdateCoinPackDto, admin: AuthenticatedAdmin, ip?: string) {
    const before = await this.packOrThrow(id);
    const data: Prisma.CoinPackUpdateInput = {};
    if (dto.coins !== undefined) data.coins = dto.coins;
    if (dto.bonusCoins !== undefined) data.bonusCoins = dto.bonusCoins;
    if (dto.prices !== undefined) {
      data.prices = normalizePrices(dto.prices) as unknown as Prisma.InputJsonValue;
    }
    if (dto.badge !== undefined) data.badge = dto.badge;
    if (dto.position !== undefined) data.position = dto.position;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (Object.keys(data).length === 0) return toCoinPackAdmin(before);
    const updated = await this.prisma.$transaction(async (tx) => {
      const pack = await tx.coinPack.update({ where: { id }, data });
      const { oldValue, newValue, changed } = diffChanges(
        pickPack(before),
        pickPack(pack),
        PACK_FIELDS,
      );
      if (changed.length > 0) {
        await this.audit.record(
          {
            actor: admin,
            action: 'coin_pack.update',
            targetType: 'coin_pack',
            targetId: id,
            oldValue,
            newValue,
            ip,
          },
          tx,
        );
      }
      return pack;
    });
    return toCoinPackAdmin(updated);
  }

  async deletePack(id: string, admin: AuthenticatedAdmin, ip?: string): Promise<void> {
    const before = await this.packOrThrow(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.coinPack.delete({ where: { id } });
      await this.audit.record(
        {
          actor: admin,
          action: 'coin_pack.delete',
          targetType: 'coin_pack',
          targetId: id,
          oldValue: pickPack(before),
          ip,
        },
        tx,
      );
    });
  }

  async reorderPacks(ids: string[], admin: AuthenticatedAdmin, ip?: string) {
    const packs = await this.prisma.coinPack.findMany({ select: { id: true, position: true } });
    const known = new Set(packs.map((p) => p.id));
    const missing = ids.filter((id) => !known.has(id));
    if (missing.length > 0) {
      throw new NotFoundException({
        code: 'PACK_NOT_FOUND',
        message: 'Unknown pack',
        details: { ids: missing },
      });
    }
    await this.prisma.$transaction(async (tx) => {
      for (const [index, id] of ids.entries()) {
        await tx.coinPack.update({ where: { id }, data: { position: index + 1 } });
      }
      await this.audit.record(
        {
          actor: admin,
          action: 'coin_pack.reorder',
          targetType: 'coin_pack',
          oldValue: packs.sort((a, b) => a.position - b.position).map((p) => p.id),
          newValue: ids,
          ip,
        },
        tx,
      );
    });
    return this.listPacks();
  }

  // ------------------------------------------------------------------ VIP plans

  async listPlans(): Promise<VipPlanAdminDto[]> {
    const plans = await this.prisma.vipPlan.findMany({
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
    return plans.map(toVipPlanAdmin);
  }

  async createPlan(dto: CreateVipPlanDto, admin: AuthenticatedAdmin, ip?: string) {
    if (await this.prisma.vipPlan.findUnique({ where: { sku: dto.sku }, select: { id: true } })) {
      throw new ConflictException({ code: 'SKU_TAKEN', message: 'A plan with this sku exists' });
    }
    const created = await this.prisma.$transaction(async (tx) => {
      const plan = await tx.vipPlan.create({
        data: {
          sku: dto.sku,
          period: dto.period,
          prices: normalizePrices(dto.prices) as unknown as Prisma.InputJsonValue,
          trialDays: dto.trialDays ?? 0,
          badge: dto.badge ?? null,
          position: dto.position ?? (await nextPosition(tx.vipPlan)),
          isActive: dto.isActive ?? true,
        },
      });
      await this.audit.record(
        {
          actor: admin,
          action: 'vip_plan.create',
          targetType: 'vip_plan',
          targetId: plan.id,
          newValue: pickPlan(plan),
          ip,
        },
        tx,
      );
      return plan;
    });
    return toVipPlanAdmin(created);
  }

  async updatePlan(id: string, dto: UpdateVipPlanDto, admin: AuthenticatedAdmin, ip?: string) {
    const before = await this.planOrThrow(id);
    const data: Prisma.VipPlanUpdateInput = {};
    if (dto.period !== undefined) data.period = dto.period;
    if (dto.prices !== undefined) {
      data.prices = normalizePrices(dto.prices) as unknown as Prisma.InputJsonValue;
    }
    if (dto.trialDays !== undefined) data.trialDays = dto.trialDays;
    if (dto.badge !== undefined) data.badge = dto.badge;
    if (dto.position !== undefined) data.position = dto.position;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (Object.keys(data).length === 0) return toVipPlanAdmin(before);
    const updated = await this.prisma.$transaction(async (tx) => {
      const plan = await tx.vipPlan.update({ where: { id }, data });
      const { oldValue, newValue, changed } = diffChanges(
        pickPlan(before),
        pickPlan(plan),
        PLAN_FIELDS,
      );
      if (changed.length > 0) {
        await this.audit.record(
          {
            actor: admin,
            action: 'vip_plan.update',
            targetType: 'vip_plan',
            targetId: id,
            oldValue,
            newValue,
            ip,
          },
          tx,
        );
      }
      return plan;
    });
    return toVipPlanAdmin(updated);
  }

  async deletePlan(id: string, admin: AuthenticatedAdmin, ip?: string): Promise<void> {
    const before = await this.planOrThrow(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.vipPlan.delete({ where: { id } });
      await this.audit.record(
        {
          actor: admin,
          action: 'vip_plan.delete',
          targetType: 'vip_plan',
          targetId: id,
          oldValue: pickPlan(before),
          ip,
        },
        tx,
      );
    });
  }

  private async packOrThrow(id: string): Promise<CoinPack> {
    const pack = await this.prisma.coinPack.findUnique({ where: { id } });
    if (!pack) throw new NotFoundException({ code: 'PACK_NOT_FOUND', message: 'Pack not found' });
    return pack;
  }

  private async planOrThrow(id: string): Promise<VipPlan> {
    const plan = await this.prisma.vipPlan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException({ code: 'PLAN_NOT_FOUND', message: 'Plan not found' });
    return plan;
  }
}

async function nextPosition(model: {
  aggregate: (args: { _max: { position: true } }) => Promise<{ _max: { position: number | null } }>;
}): Promise<number> {
  const agg = await model.aggregate({ _max: { position: true } });
  return (agg._max.position ?? 0) + 1;
}

/** Une entrée par devise (la dernière gagne), triée XOF, NGN, GHS, EUR, USD. */
function normalizePrices(prices: PriceDto[]): PriceDto[] {
  const byCurrency = new Map(prices.map((p) => [p.currency, p.amountMinor]));
  return [...byCurrency.entries()].map(([currency, amountMinor]) => ({ currency, amountMinor }));
}

function pickPack(p: CoinPack) {
  return {
    sku: p.sku,
    coins: p.coins,
    bonusCoins: p.bonusCoins,
    prices: parsePrices(p.prices),
    badge: p.badge,
    position: p.position,
    isActive: p.isActive,
  };
}

function pickPlan(p: VipPlan) {
  return {
    sku: p.sku,
    period: p.period,
    prices: parsePrices(p.prices),
    trialDays: p.trialDays,
    badge: p.badge,
    position: p.position,
    isActive: p.isActive,
  };
}

export function toCoinPackAdmin(p: CoinPack): CoinPackAdminDto {
  const prices = parsePrices(p.prices);
  return {
    id: p.id,
    sku: p.sku,
    coins: p.coins,
    bonusCoins: p.bonusCoins,
    price: prices.find((x) => x.currency === FALLBACK_CURRENCY) ??
      prices[0] ?? { currency: FALLBACK_CURRENCY, amountMinor: 0 },
    prices,
    badge: p.badge,
    position: p.position,
    isActive: p.isActive,
    createdAt: p.createdAt.toISOString(),
  };
}

export function toVipPlanAdmin(p: VipPlan): VipPlanAdminDto {
  const prices = parsePrices(p.prices);
  return {
    id: p.id,
    sku: p.sku,
    period: p.period,
    price: prices.find((x) => x.currency === FALLBACK_CURRENCY) ??
      prices[0] ?? { currency: FALLBACK_CURRENCY, amountMinor: 0 },
    prices,
    trialDays: p.trialDays,
    badge: p.badge,
    position: p.position,
    isActive: p.isActive,
    createdAt: p.createdAt.toISOString(),
  };
}
