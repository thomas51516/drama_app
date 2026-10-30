import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { WalletDto } from '../../wallet/dto/wallet.dto.js';

/** Offre de bienvenue vue par l'app (M-24) : bonus en % sur le premier achat, pendant `hours` après la création du compte. */
export class WelcomeOfferDto {
  @ApiProperty({
    type: String,
    nullable: true,
    example: 'coins_300',
    description: 'Pack concerné ; null = tout pack',
  })
  packSku: string | null;

  @ApiProperty({ example: 50 })
  bonusPercent: number;

  @ApiProperty({ format: 'date-time', description: 'Fin de la fenêtre pour ce compte' })
  expiresAt: string;
}

export class LimitedOfferDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Week-end double bonus' })
  title: string;

  @ApiProperty({ example: 'coins_700' })
  packSku: string;

  @ApiProperty({ example: 30 })
  bonusPercent: number;

  @ApiProperty({ format: 'date-time' })
  endsAt: string;
}

/** `GET /offers` */
export class OffersDto {
  @ApiProperty({ type: WelcomeOfferDto, nullable: true })
  welcome: WelcomeOfferDto | null;

  @ApiProperty({
    type: [LimitedOfferDto],
    description: 'Offres limitées actives (informatives ; bonus appliqué au crédit)',
  })
  limited: LimitedOfferDto[];
}

export class RedeemPromoDto {
  @ApiProperty({ example: 'BIENVENUE50' })
  @IsString()
  @Length(3, 40)
  code: string;

  @ApiProperty({ example: '6f1d2c3b-4a5e-4f60-8b7c-9d0e1f2a3b4c' })
  @IsString()
  @Length(8, 128)
  idempotencyKey: string;
}

export class RedeemPromoResultDto {
  @ApiProperty({ example: 50, description: 'Pièces bonus créditées' })
  coins: number;

  @ApiProperty({ type: WalletDto })
  wallet: WalletDto;
}

// ----------------------------------------------------------------------------- admin (B-07)

export class WelcomeOfferSettingsDto {
  @ApiProperty()
  @IsBoolean()
  isActive: boolean;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'coins_300',
    description: 'null = tout pack',
  })
  @ValidateIf((_, v) => v !== null)
  @IsOptional()
  @IsString()
  @Length(1, 120)
  @Matches(/^[a-z0-9_.]+$/)
  packSku: string | null;

  @ApiProperty({ example: 50 })
  @IsInt()
  @Min(0)
  @Max(500)
  bonusPercent: number;

  @ApiProperty({ example: 48, description: 'Fenêtre après la création du compte (heures)' })
  @IsInt()
  @Min(1)
  @Max(8760)
  hours: number;
}

export class LimitedOfferAdminDto extends LimitedOfferDto {
  @ApiProperty({ format: 'date-time' })
  startsAt: string;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;
}

export class CreateLimitedOfferDto {
  @ApiProperty({ example: 'Week-end double bonus' })
  @IsString()
  @Length(1, 120)
  title: string;

  @ApiProperty({ example: 'coins_700' })
  @IsString()
  @Length(1, 120)
  @Matches(/^[a-z0-9_.]+$/)
  packSku: string;

  @ApiProperty({ example: 30 })
  @IsInt()
  @Min(1)
  @Max(500)
  bonusPercent: number;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  startsAt: string;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  endsAt: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateLimitedOfferDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 120)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 120)
  @Matches(/^[a-z0-9_.]+$/)
  packSku?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  bonusPercent?: number;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  startsAt?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  endsAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class PromoCodeAdminDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'BIENVENUE50' })
  code: string;

  @ApiProperty({ example: 50 })
  coins: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Utilisations totales max ; null = illimité',
  })
  maxUses: number | null;

  @ApiProperty({ example: 1, description: 'Utilisations max par compte' })
  perUserUses: number;

  @ApiProperty({ example: 12 })
  usesCount: number;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  startsAt: string | null;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  endsAt: string | null;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;
}

export class CreatePromoCodeDto {
  @ApiProperty({
    example: 'BIENVENUE50',
    description: 'Lettres, chiffres, tirets et soulignés ; mis en majuscules',
  })
  @IsString()
  @Length(3, 40)
  @Matches(/^[A-Za-z0-9_-]+$/, { message: 'code must contain letters, digits, - or _' })
  code: string;

  @ApiProperty({ example: 50 })
  @IsInt()
  @Min(1)
  @Max(100_000)
  coins: number;

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'null = illimité' })
  @ValidateIf((_, v) => v !== null)
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000_000)
  maxUses?: number | null;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  perUserUses?: number;

  @ApiPropertyOptional({ type: String, nullable: true, format: 'date-time' })
  @ValidateIf((_, v) => v !== null)
  @IsOptional()
  @IsISO8601()
  startsAt?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, format: 'date-time' })
  @ValidateIf((_, v) => v !== null)
  @IsOptional()
  @IsISO8601()
  endsAt?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdatePromoCodeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100_000)
  coins?: number;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @ValidateIf((_, v) => v !== null)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_000_000)
  maxUses?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  perUserUses?: number;

  @ApiPropertyOptional({ type: String, nullable: true, format: 'date-time' })
  @ValidateIf((_, v) => v !== null)
  @IsOptional()
  @IsISO8601()
  startsAt?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, format: 'date-time' })
  @ValidateIf((_, v) => v !== null)
  @IsOptional()
  @IsISO8601()
  endsAt?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class PromoRedemptionDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  userId: string;

  @ApiProperty({ example: 50 })
  coins: number;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;
}

export class PromoRedemptionsDto {
  @ApiProperty({ type: [PromoRedemptionDto], description: 'Antichronologique, 200 dernières' })
  items: PromoRedemptionDto[];

  @ApiProperty()
  total: number;
}
