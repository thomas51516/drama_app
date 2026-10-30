import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  NotEquals,
} from 'class-validator';
import { UserDto, VIP_STATUSES, type VipStatus } from '../../../auth/dto/user.dto.js';
import { SubscriptionStatusDto } from '../../../billing/dto/billing.dto.js';
import {
  CoinBucket,
  PurchaseStatus,
  UserStatus,
  UserType,
} from '../../../generated/prisma/client.js';
import { UNLOCK_METHODS, type UnlockMethodLabel } from '../../../unlock/dto/unlock.dto.js';
import { LedgerEntryDto, WalletDto } from '../../../wallet/dto/wallet.dto.js';

export class ListAdminUsersQueryDto {
  @ApiPropertyOptional({
    description: 'Identifiant exact, e-mail, téléphone ou nom affiché (contient)',
    example: 'awa',
  })
  @IsOptional()
  @IsString()
  @MaxLength(320)
  q?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;
}

export class AdminUserBalanceDto {
  @ApiProperty()
  purchased: number;

  @ApiProperty()
  bonus: number;

  @ApiProperty()
  total: number;
}

/** `AdminUserSummary` (contrat v1.4). */
export class AdminUserSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: Object.values(UserType) })
  type: UserType;

  @ApiProperty({ enum: Object.values(UserStatus) })
  status: UserStatus;

  @ApiProperty({ type: String, nullable: true })
  displayName: string | null;

  @ApiProperty({ type: String, nullable: true })
  email: string | null;

  @ApiProperty({ type: String, nullable: true })
  phone: string | null;

  @ApiProperty({ type: String, nullable: true })
  country: string | null;

  @ApiProperty({ enum: VIP_STATUSES })
  vipStatus: VipStatus;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  vipExpiresAt: string | null;

  @ApiProperty({ type: AdminUserBalanceDto })
  balance: AdminUserBalanceDto;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  lastSeenAt: string | null;
}

export class AdminUserListDto {
  @ApiProperty({ type: [AdminUserSummaryDto] })
  items: AdminUserSummaryDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  pageSize: number;
}

export class AdminUserUnlockDto {
  @ApiProperty({ format: 'uuid' })
  episodeId: string;

  @ApiProperty({ format: 'uuid' })
  seriesId: string;

  @ApiProperty()
  seriesTitle: string;

  @ApiProperty()
  episodeNumber: number;

  @ApiProperty({ enum: UNLOCK_METHODS })
  method: UnlockMethodLabel;

  @ApiProperty({ format: 'date-time' })
  at: string;
}

export class AdminUserPurchaseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'coins_100' })
  productId: string;

  @ApiProperty({ enum: Object.values(PurchaseStatus) })
  status: PurchaseStatus;

  @ApiProperty()
  coins: number;

  @ApiProperty()
  bonusCoins: number;

  @ApiProperty({ type: String, nullable: true })
  orderId: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  creditedAt: string | null;
}

export class AdminUserDetailDto {
  @ApiProperty({ type: UserDto })
  user: UserDto;

  @ApiProperty({ type: WalletDto })
  wallet: WalletDto;

  @ApiProperty({ type: SubscriptionStatusDto })
  subscription: SubscriptionStatusDto;

  @ApiProperty({ type: [AdminUserUnlockDto], description: '50 derniers déblocages' })
  unlocks: AdminUserUnlockDto[];

  @ApiProperty({ type: [AdminUserPurchaseDto], description: '50 derniers achats' })
  purchases: AdminUserPurchaseDto[];

  @ApiProperty({ type: [LedgerEntryDto], description: '20 dernières lignes du grand livre' })
  recentLedger: LedgerEntryDto[];

  @ApiProperty({ description: 'Appareils push enregistrés' })
  devices: number;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  lastSeenAt: string | null;
}

export class AdjustCoinsDto {
  @ApiProperty({
    example: 50,
    description: 'Montant signé : positif = crédit, négatif = débit (jamais 0)',
  })
  @IsInt()
  @Min(-1_000_000)
  @Max(1_000_000)
  @NotEquals(0)
  amount: number;

  @ApiProperty({
    enum: Object.values(CoinBucket),
    description: 'Bucket touché ; un crédit BONUS expire après `bonusValidityDays`',
  })
  @IsIn(Object.values(CoinBucket))
  bucket: CoinBucket;

  @ApiProperty({
    example: 'Geste commercial après incident de lecture',
    minLength: 3,
    maxLength: 500,
  })
  @IsString()
  @Length(3, 500)
  reason: string;
}

export class BlockUserDto {
  @ApiProperty({ example: 'Fraude au remboursement', minLength: 3, maxLength: 500 })
  @IsString()
  @Length(3, 500)
  reason: string;
}
