import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { CURRENCIES, type Currency } from '../../common/money/currency.js';
import { VipPeriod } from '../../generated/prisma/client.js';

/** `Price` (contrat v1.4) : montant en unité mineure dans une devise de la boutique. */
export class PriceDto {
  @ApiProperty({ enum: CURRENCIES, example: 'XOF' })
  @IsIn(CURRENCIES)
  currency: Currency;

  @ApiProperty({
    example: 1000,
    description: 'Montant en unité mineure (centimes ; FCFA sans décimale)',
  })
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  amountMinor: number;
}

/** Pack de pièces tel que vu par l'application (`GET /shop`). */
export class CoinPackDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'coins_100', description: 'Identifiant produit Play Console' })
  sku: string;

  @ApiProperty({ example: 100 })
  coins: number;

  @ApiProperty({ example: 10, description: 'Pièces bonus offertes (expirables)' })
  bonusCoins: number;

  @ApiProperty({ type: PriceDto, description: 'Prix dans la devise du pays (repli USD)' })
  price: PriceDto;

  @ApiPropertyOptional({ example: 'Populaire', nullable: true })
  badge?: string | null;

  @ApiProperty({ example: 1 })
  position: number;
}

/** Formule VIP telle que vue par l'application. */
export class VipPlanDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'vip_month', description: 'Identifiant abonnement Play Console' })
  sku: string;

  @ApiProperty({ enum: Object.values(VipPeriod) })
  period: VipPeriod;

  @ApiProperty({ type: PriceDto })
  price: PriceDto;

  @ApiProperty({ example: 0, description: 'Jours d’essai gratuits' })
  trialDays: number;

  @ApiPropertyOptional({ example: 'Meilleure offre', nullable: true })
  badge?: string | null;
}

export class ShopDto {
  @ApiProperty({ enum: CURRENCIES, description: 'Devise retenue pour `X-Country` (repli USD)' })
  currency: Currency;

  @ApiProperty({ type: [CoinPackDto] })
  coinPacks: CoinPackDto[];

  @ApiProperty({ type: [VipPlanDto] })
  vipPlans: VipPlanDto[];

  @ApiProperty({
    type: 'object',
    nullable: true,
    description: 'Offre de bienvenue (M-24, P2) : toujours null au MVP',
    additionalProperties: true,
  })
  welcomeOffer: null;
}

// ----------------------------------------------------------------------------- admin

export class MonetizationSettingsDto {
  @ApiProperty({ example: 5, description: 'Épisodes gratuits proposés à la création d’une série' })
  @IsInt()
  @Min(0)
  @Max(1000)
  defaultFreeEpisodes: number;

  @ApiProperty({ example: 10, description: 'Coût par épisode proposé à la création d’une série' })
  @IsInt()
  @Min(0)
  @Max(10_000)
  defaultCoinCost: number;

  @ApiProperty({
    example: 0,
    description: 'Remise sur le déblocage d’une série entière (M-23, P2)',
  })
  @IsInt()
  @Min(0)
  @Max(100)
  seriesUnlockDiscountPercent: number;

  @ApiProperty({ example: 3, description: 'Pubs récompensées par utilisateur et par jour (M-22)' })
  @IsInt()
  @Min(0)
  @Max(100)
  adDailyCap: number;

  @ApiProperty({ description: 'Déblocage automatique activé par défaut sur les nouveaux comptes' })
  @IsBoolean()
  autoUnlockDefault: boolean;

  @ApiProperty({ example: 30, description: 'Validité des pièces bonus créditées (jours)' })
  @IsInt()
  @Min(1)
  @Max(3650)
  bonusValidityDays: number;
}

export class CoinPackAdminDto extends CoinPackDto {
  @ApiProperty({ type: [PriceDto], description: 'Liste de prix complète (toutes devises)' })
  prices: PriceDto[];

  @ApiProperty()
  isActive: boolean;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;
}

export class VipPlanAdminDto extends VipPlanDto {
  @ApiProperty({ type: [PriceDto] })
  prices: PriceDto[];

  @ApiProperty()
  isActive: boolean;

  @ApiProperty({ example: 1 })
  position: number;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;
}

export class CreateCoinPackDto {
  @ApiProperty({ example: 'coins_100', description: 'Identifiant produit Play Console, immuable' })
  @IsString()
  @Length(1, 120)
  @Matches(/^[a-z0-9_.]+$/, { message: 'sku must match Play Console product id format' })
  sku: string;

  @ApiProperty({ example: 100 })
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  coins: number;

  @ApiPropertyOptional({ example: 10, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  bonusCoins?: number;

  @ApiProperty({ type: [PriceDto], description: 'Au moins un prix ; USD recommandé comme repli' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => PriceDto)
  prices: PriceDto[];

  @ApiPropertyOptional({ example: 'Populaire', nullable: true })
  @IsOptional()
  @IsString()
  @Length(1, 40)
  badge?: string | null;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  position?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateCoinPackDto {
  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  coins?: number;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  bonusCoins?: number;

  @ApiPropertyOptional({ type: [PriceDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => PriceDto)
  prices?: PriceDto[];

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @Length(1, 40)
  badge?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  position?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ReorderDto {
  @ApiProperty({ type: [String], format: 'uuid', description: 'Identifiants dans l’ordre voulu' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  ids: string[];
}

export class CreateVipPlanDto {
  @ApiProperty({
    example: 'vip_month',
    description: 'Identifiant abonnement Play Console, immuable',
  })
  @IsString()
  @Length(1, 120)
  @Matches(/^[a-z0-9_.-]+$/, { message: 'sku must match Play Console subscription id format' })
  sku: string;

  @ApiProperty({ enum: Object.values(VipPeriod) })
  @IsIn(Object.values(VipPeriod))
  period: VipPeriod;

  @ApiProperty({ type: [PriceDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => PriceDto)
  prices: PriceDto[];

  @ApiPropertyOptional({ example: 0, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  trialDays?: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @Length(1, 40)
  badge?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  position?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateVipPlanDto {
  @ApiPropertyOptional({ enum: Object.values(VipPeriod) })
  @IsOptional()
  @IsIn(Object.values(VipPeriod))
  period?: VipPeriod;

  @ApiPropertyOptional({ type: [PriceDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => PriceDto)
  prices?: PriceDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  trialDays?: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @Length(1, 40)
  badge?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  position?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/** Barème du check-in quotidien (M-40, B-08) : 7 montants en pièces bonus. */
export class CheckinScaleDto {
  @ApiProperty({ type: [Number], example: [5, 5, 10, 10, 15, 20, 30], minItems: 7, maxItems: 7 })
  @IsArray()
  @ArrayMinSize(7)
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(10_000, { each: true })
  days: number[];

  @ApiProperty({ description: 'Un jour manqué remet le cycle au jour 1' })
  @IsBoolean()
  resetOnMiss: boolean;
}
