import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Length, Matches, Max, Min } from 'class-validator';
import { TopupOrderStatus } from '../../generated/prisma/client.js';
import { PriceDto } from '../../monetization/dto/monetization.dto.js';

export class CreateTopupOrderDto {
  @ApiProperty({ example: 'coins_300' })
  @IsString()
  @Length(1, 120)
  @Matches(/^[a-z0-9_.]+$/)
  packSku: string;

  @ApiProperty({ example: 'TG', description: 'Pays ISO 3166-1 alpha-2 : devise et opérateurs' })
  @IsString()
  @Matches(/^[A-Za-z]{2}$/, { message: 'country must be an ISO 3166-1 alpha-2 code' })
  country: string;

  @ApiPropertyOptional({ example: '+22890000000', description: 'Numéro mobile money (E.164)' })
  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9]{6,20}$/, { message: 'phone must be a mobile number' })
  phone?: string;

  @ApiProperty({ example: '6f1d2c3b-4a5e-4f60-8b7c-9d0e1f2a3b4c' })
  @IsString()
  @Length(8, 128)
  idempotencyKey: string;
}

/** `POST /topup/orders` (contrat v1.5). */
export class TopupOrderCreatedDto {
  @ApiProperty({ format: 'uuid' })
  orderId: string;

  @ApiProperty({ type: PriceDto })
  amount: PriceDto;

  @ApiProperty({
    example: 'https://checkout.cinetpay.com/payment/…',
    description:
      'Page de paiement de l’agrégateur (ou page simulée `/topup/fake/{orderId}` en dev)',
  })
  paymentUrl: string;

  @ApiProperty({ format: 'date-time', description: 'Commande expirée au-delà (1 h)' })
  expiresAt: string;
}

export class TopupOrderDto {
  @ApiProperty({ format: 'uuid' })
  orderId: string;

  @ApiProperty({ enum: Object.values(TopupOrderStatus) })
  status: TopupOrderStatus;

  @ApiProperty({ example: 'coins_300' })
  packSku: string;

  @ApiProperty({ example: 300, description: 'Pièces achetées du pack' })
  coins: number;

  @ApiProperty({
    example: 45,
    description: 'Pièces bonus créditées (pack + offres), connues après paiement',
  })
  bonusCoins: number;

  @ApiProperty({ type: PriceDto })
  amount: PriceDto;

  @ApiProperty({ type: String, nullable: true })
  paymentUrl: string | null;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  creditedAt: string | null;

  @ApiProperty({ format: 'date-time' })
  expiresAt: string;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;
}

export class TopupOrdersQueryDto {
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

export class TopupOrdersDto {
  @ApiProperty({ type: [TopupOrderDto], description: 'Antichronologique' })
  items: TopupOrderDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  pageSize: number;
}

export class WebhookAckDto {
  @ApiProperty()
  accepted: boolean;
}

/** Formulaire de la page de paiement simulée (`POST /topup/fake/{orderId}`). */
export class FakePayDto {
  @ApiProperty({ enum: ['paid', 'failed'] })
  @IsIn(['paid', 'failed'])
  outcome: 'paid' | 'failed';
}

// ----------------------------------------------------------------------------- admin (B-11)

export class ReconciliationQueryDto {
  @ApiPropertyOptional({
    example: '2026-10-30',
    description: 'Jour UTC `YYYY-MM-DD` ; défaut : hier',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  date?: string;
}

export class ReconciliationMismatchDto {
  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  orderId: string | null;

  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  userId: string | null;

  @ApiProperty({ enum: ['NOT_CREDITED', 'AMOUNT_MISMATCH', 'LEDGER_WITHOUT_ORDER'] })
  reason: 'NOT_CREDITED' | 'AMOUNT_MISMATCH' | 'LEDGER_WITHOUT_ORDER';

  @ApiProperty({ example: 300, description: 'Pièces attendues (commande)' })
  expectedCoins: number;

  @ApiProperty({ example: 0, description: 'Pièces trouvées dans le grand livre' })
  creditedCoins: number;
}

export class ReconciliationAmountDto {
  @ApiProperty({ example: 'XOF' })
  currency: string;

  @ApiProperty({ example: 15000 })
  amountMinor: number;
}

export class ReconciliationDto {
  @ApiProperty({ example: '2026-10-30' })
  date: string;

  @ApiProperty({ example: 12, description: 'Commandes créées ce jour (tous statuts)' })
  orders: number;

  @ApiProperty({ example: 9, description: 'Commandes payées ce jour (webhook reçu)' })
  paid: number;

  @ApiProperty({
    example: 9,
    description: 'Commandes payées dont le grand livre porte la ligne PURCHASE',
  })
  credited: number;

  @ApiProperty({ type: [ReconciliationAmountDto], description: 'Montants encaissés par devise' })
  amounts: ReconciliationAmountDto[];

  @ApiProperty({ type: [ReconciliationMismatchDto] })
  mismatches: ReconciliationMismatchDto[];

  @ApiProperty({ format: 'date-time' })
  generatedAt: string;
}
