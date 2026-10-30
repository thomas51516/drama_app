import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { CoinBucket, LedgerEntryType } from '../../generated/prisma/client.js';

export class BonusExpiringDto {
  @ApiProperty({ example: 20, description: 'Pièces bonus restantes de ce lot' })
  amount: number;

  @ApiProperty({ format: 'date-time' })
  expiresAt: string;
}

/** `Wallet` (contrat v1.4) : projection du grand livre `coin_ledger`, le serveur fait foi. */
export class WalletDto {
  @ApiProperty({
    example: 120,
    description: 'Pièces achetées (peut être négatif après remboursement)',
  })
  purchased: number;

  @ApiProperty({ example: 30, description: 'Pièces bonus, consommées en premier, expirables' })
  bonus: number;

  @ApiProperty({ example: 150 })
  total: number;

  @ApiProperty({ description: 'Déblocage automatique de l’épisode suivant (`PATCH /me`)' })
  autoUnlock: boolean;

  @ApiProperty({
    type: [BonusExpiringDto],
    description: 'Lots de pièces bonus restants, du plus proche de l’expiration au plus lointain',
  })
  bonusExpiring: BonusExpiringDto[];
}

export class LedgerReferenceDto {
  @ApiProperty({
    example: 'unlock',
    description: 'unlock, purchase, refund, admin_adjustment, account_merge, bonus_expiry',
  })
  type: string;

  @ApiProperty({ example: '0192f3b2-...' })
  id: string;
}

/** `LedgerEntry` (contrat v1.4). */
export class LedgerEntryDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: -10, description: 'Montant signé (+ crédit, − débit)' })
  amount: number;

  @ApiProperty({ enum: Object.values(CoinBucket) })
  bucket: CoinBucket;

  @ApiProperty({ enum: Object.values(LedgerEntryType) })
  type: LedgerEntryType;

  @ApiProperty({ type: LedgerReferenceDto, nullable: true })
  reference: LedgerReferenceDto | null;

  @ApiProperty({ type: String, nullable: true, description: 'Libellé technique (anglais)' })
  description: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    format: 'date-time',
    description: 'Expiration du lot bonus concerné',
  })
  expiresAt: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;
}

export class WalletTransactionsQueryDto {
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

  @ApiPropertyOptional({
    enum: Object.values(LedgerEntryType),
    description: 'Filtre par type de ligne',
  })
  @IsOptional()
  @IsIn(Object.values(LedgerEntryType))
  type?: LedgerEntryType;
}

export class WalletTransactionsDto {
  @ApiProperty({ type: [LedgerEntryDto], description: 'Antichronologique' })
  items: LedgerEntryDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  pageSize: number;
}
