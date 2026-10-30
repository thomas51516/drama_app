import { Injectable } from '@nestjs/common';
import { AuditService, diffChanges } from '../admin/audit/audit.service.js';
import { type AuthenticatedAdmin } from '../common/request-context.js';
import { AppConfig } from '../config/app-config.js';
import { type MonetizationSettings } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { type CheckinScaleDto, type MonetizationSettingsDto } from './dto/monetization.dto.js';

export const SETTINGS_ID = 'default';
const CACHE_TTL_MS = 15_000;

const SETTINGS_FIELDS = [
  'defaultFreeEpisodes',
  'defaultCoinCost',
  'seriesUnlockDiscountPercent',
  'adDailyCap',
  'autoUnlockDefault',
  'bonusValidityDays',
] as const;

/**
 * Paramètres de monétisation (B-06, B-08, S07-BE-05) : une seule ligne `monetization_settings`,
 * créée à la demande avec les valeurs par défaut (`BONUS_VALIDITY_DAYS` pour la validité des bonus).
 * Les séries conservent leurs propres `freeEpisodeCount` / `coinCostPerEpisode` (autoritaires) ;
 * les défauts s'appliquent à la création d'une série. Lecture mise en cache 15 s par processus.
 */
@Injectable()
export class MonetizationSettingsService {
  private cached: { value: MonetizationSettings; at: number } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly audit: AuditService,
  ) {}

  async get(): Promise<MonetizationSettings> {
    if (this.cached && Date.now() - this.cached.at < CACHE_TTL_MS) return this.cached.value;
    const value = await this.prisma.monetizationSettings.upsert({
      where: { id: SETTINGS_ID },
      update: {},
      create: { id: SETTINGS_ID, bonusValidityDays: this.config.billing.bonusValidityDays },
    });
    this.cached = { value, at: Date.now() };
    return value;
  }

  invalidate(): void {
    this.cached = null;
  }

  async bonusValidityDays(): Promise<number> {
    return (await this.get()).bonusValidityDays;
  }

  async update(
    dto: MonetizationSettingsDto,
    admin: AuthenticatedAdmin,
    ip?: string,
  ): Promise<MonetizationSettings> {
    const before = await this.get();
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.monetizationSettings.update({ where: { id: SETTINGS_ID }, data: dto });
      const { oldValue, newValue, changed } = diffChanges(
        before as unknown as Record<string, unknown>,
        row as unknown as Record<string, unknown>,
        SETTINGS_FIELDS,
      );
      if (changed.length > 0) {
        await this.audit.record(
          {
            actor: admin,
            action: 'monetization_settings.update',
            targetType: 'monetization_settings',
            targetId: SETTINGS_ID,
            oldValue,
            newValue,
            ip,
          },
          tx,
        );
      }
      return row;
    });
    this.invalidate();
    return updated;
  }

  async getCheckin(): Promise<CheckinScaleDto> {
    const s = await this.get();
    return { days: s.checkinDays, resetOnMiss: s.checkinResetOnMiss };
  }

  async updateCheckin(
    dto: CheckinScaleDto,
    admin: AuthenticatedAdmin,
    ip?: string,
  ): Promise<CheckinScaleDto> {
    const before = await this.getCheckin();
    await this.prisma.$transaction(async (tx) => {
      await tx.monetizationSettings.update({
        where: { id: SETTINGS_ID },
        data: { checkinDays: dto.days, checkinResetOnMiss: dto.resetOnMiss },
      });
      await this.audit.record(
        {
          actor: admin,
          action: 'rewards.checkin_update',
          targetType: 'monetization_settings',
          targetId: SETTINGS_ID,
          oldValue: before,
          newValue: dto,
          ip,
        },
        tx,
      );
    });
    this.invalidate();
    return { days: dto.days, resetOnMiss: dto.resetOnMiss };
  }
}

export function toSettingsDto(s: MonetizationSettings): MonetizationSettingsDto {
  return {
    defaultFreeEpisodes: s.defaultFreeEpisodes,
    defaultCoinCost: s.defaultCoinCost,
    seriesUnlockDiscountPercent: s.seriesUnlockDiscountPercent,
    adDailyCap: s.adDailyCap,
    autoUnlockDefault: s.autoUnlockDefault,
    bonusValidityDays: s.bonusValidityDays,
  };
}
