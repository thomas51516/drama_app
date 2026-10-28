import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsObject, IsOptional, IsString, Length } from 'class-validator';
import {
  PurchaseStatus,
  SubscriptionPlan,
  SubscriptionStatus,
} from '../../generated/prisma/client.js';
import { WalletDto } from '../../wallet/dto/wallet.dto.js';

export const GOOGLE_PRODUCT_KINDS = ['coins', 'subscription'] as const;

/** Planifié S07-BE-06. */
export class GoogleVerifyDto {
  @ApiProperty({ enum: GOOGLE_PRODUCT_KINDS })
  @IsIn(GOOGLE_PRODUCT_KINDS)
  kind: (typeof GOOGLE_PRODUCT_KINDS)[number];

  @ApiProperty({ example: 'coins_100', description: 'SKU Google Play' })
  @IsString()
  @Length(1, 120)
  productId: string;

  @ApiProperty({ description: 'purchaseToken renvoyé par Play Billing (unique, idempotence)' })
  @IsString()
  @Length(10, 512)
  purchaseToken: string;
}

export class SubscriptionDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: Object.values(SubscriptionPlan) })
  plan: SubscriptionPlan;

  @ApiProperty({ enum: Object.values(SubscriptionStatus) })
  status: SubscriptionStatus;

  @ApiProperty({ format: 'date-time' })
  startsAt: string;

  @ApiProperty({ format: 'date-time' })
  endsAt: string;

  @ApiProperty()
  autoRenew: boolean;
}

export class PurchaseResultDto {
  @ApiProperty({ format: 'uuid' })
  purchaseId: string;

  @ApiProperty({ enum: Object.values(PurchaseStatus) })
  status: PurchaseStatus;

  @ApiProperty({ example: 100 })
  coinsCredited: number;

  @ApiProperty({ example: 10 })
  bonusCoinsCredited: number;

  @ApiProperty({ description: 'Achat déjà crédité (même purchaseToken)' })
  alreadyProcessed: boolean;

  @ApiProperty({ type: WalletDto })
  wallet: WalletDto;

  @ApiPropertyOptional({ type: SubscriptionDto, description: 'Présent pour `kind: subscription`' })
  subscription?: SubscriptionDto;
}

export class PubSubMessageDto {
  @ApiProperty({ description: 'Charge utile base64 (DeveloperNotification)' })
  @IsString()
  data: string;

  @ApiProperty()
  @IsString()
  messageId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  publishTime?: string;
}

/** Enveloppe Pub/Sub des Real-time developer notifications — planifié S07-BE-07. */
export class GoogleRtdnDto {
  @ApiProperty({ type: PubSubMessageDto })
  @IsObject()
  message: PubSubMessageDto;

  @ApiPropertyOptional({ description: 'Nom de l’abonnement Pub/Sub' })
  @IsOptional()
  @IsString()
  subscription?: string;
}

/** Corps brut de l’agrégateur mobile money (CinetPay, FedaPay, PayDunya…) — planifié S09-BE-01. */
export class MobileMoneyWebhookDto {
  @ApiProperty({ description: 'Identifiant de transaction agrégateur (idempotence)' })
  @IsString()
  transactionId: string;

  @ApiProperty({ example: 'ACCEPTED', description: 'Statut selon l’agrégateur' })
  @IsString()
  status: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description: 'Charge utile complète conservée telle quelle',
  })
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}

export class WebhookAckDto {
  @ApiProperty()
  accepted: boolean;
}
