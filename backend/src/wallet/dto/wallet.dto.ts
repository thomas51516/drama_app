import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { CoinBucket, LedgerEntryType } from '../../generated/prisma/client.js';

/** Soldes (projection du grand livre `coin_ledger`). Planifié S07-BE-04. */
export class WalletDto {
  @ApiProperty({ example: 120, description: 'Pièces achetées' })
  purchasedBalance: number;

  @ApiProperty({ example: 30, description: 'Pièces bonus (consommées en premier, expirables)' })
  bonusBalance: number;

  @ApiProperty({ example: 150 })
  totalBalance: number;

  @ApiProperty({
    type: String,
    nullable: true,
    format: 'date-time',
    description: 'Prochaine expiration de pièces bonus',
  })
  nextBonusExpiryAt: string | null;

  @ApiProperty()
  isVip: boolean;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  vipExpiresAt: string | null;
}

export class WalletTransactionDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: -10, description: 'Montant signé (+ crédit, - débit)' })
  amount: number;

  @ApiProperty({ enum: Object.values(CoinBucket) })
  bucket: CoinBucket;

  @ApiProperty({ enum: Object.values(LedgerEntryType) })
  type: LedgerEntryType;

  @ApiProperty({ type: String, nullable: true, example: 'unlock' })
  referenceType: string | null;

  @ApiProperty({ type: String, nullable: true })
  referenceId: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Libellé affichable' })
  note: string | null;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  expiresAt: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;
}

export class WalletTransactionsQueryDto {
  @ApiPropertyOptional({ description: 'Curseur opaque renvoyé par l’appel précédent' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 20;
}

export class WalletTransactionsDto {
  @ApiProperty({ type: [WalletTransactionDto] })
  items: WalletTransactionDto[];

  @ApiProperty({ type: String, nullable: true })
  nextCursor: string | null;
}
