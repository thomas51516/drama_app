import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsObject, IsOptional, IsString, Length } from 'class-validator';
import { VipPlanDto } from '../../monetization/dto/monetization.dto.js';
import { WalletDto } from '../../wallet/dto/wallet.dto.js';

export const GOOGLE_PURCHASE_TYPES = ['inapp', 'subs'] as const;
export type GooglePurchaseType = (typeof GOOGLE_PURCHASE_TYPES)[number];

export const VERIFY_STATUSES = ['credited', 'already_processed', 'subscription_active'] as const;
export type VerifyStatus = (typeof VERIFY_STATUSES)[number];

export const SUBSCRIPTION_STATUSES = ['none', 'active', 'cancelled', 'expired', 'grace'] as const;
export type SubscriptionStatusLabel = (typeof SUBSCRIPTION_STATUSES)[number];

/** `POST /billing/google/verify` (contrat v1.4). */
export class GoogleVerifyDto {
  @ApiProperty({
    description:
      'purchaseToken renvoyé par Play Billing (unique : idempotence). Vérificateur `fake` : `fake:<productId>:<nonce>`.',
  })
  @IsString()
  @Length(10, 512)
  purchaseToken: string;

  @ApiProperty({ example: 'coins_100', description: 'SKU Play Console (pack ou abonnement)' })
  @IsString()
  @Length(1, 120)
  productId: string;

  @ApiProperty({
    enum: GOOGLE_PURCHASE_TYPES,
    description: '`inapp` = pack de pièces, `subs` = VIP',
  })
  @IsIn(GOOGLE_PURCHASE_TYPES)
  type: GooglePurchaseType;

  @ApiProperty({
    description: 'Clé d’idempotence côté app (UUID)',
    example: '6f1d2c3b-4a5e-4f60-8b7c-9d0e1f2a3b4c',
  })
  @IsString()
  @Length(8, 128)
  idempotencyKey: string;
}

/** `GET /me/subscription` (contrat v1.4). */
export class SubscriptionStatusDto {
  @ApiProperty({ enum: SUBSCRIPTION_STATUSES })
  status: SubscriptionStatusLabel;

  @ApiProperty({
    type: VipPlanDto,
    nullable: true,
    description: 'Formule souscrite (prix dans la devise du pays)',
  })
  plan: VipPlanDto | null;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  startedAt: string | null;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  expiresAt: string | null;

  @ApiProperty()
  autoRenew: boolean;

  @ApiProperty({ enum: ['google'], description: 'Magasin : géré depuis Google Play (M-33)' })
  store: 'google';
}

export class VerifyResultDto {
  @ApiProperty({ enum: VERIFY_STATUSES })
  status: VerifyStatus;

  @ApiPropertyOptional({ type: WalletDto, description: 'Présent pour un pack (`inapp`)' })
  wallet?: WalletDto;

  @ApiPropertyOptional({
    type: SubscriptionStatusDto,
    description: 'Présent pour un abonnement (`subs`)',
  })
  vip?: SubscriptionStatusDto;
}

export class PubSubMessageDto {
  @ApiProperty({ description: 'Charge utile base64 (DeveloperNotification)' })
  @IsString()
  data: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  messageId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  message_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  publishTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  publish_time?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  attributes?: Record<string, string>;
}

/** Enveloppe Pub/Sub des Real-time developer notifications (S07-BE-07). */
export class GoogleRtdnDto {
  @ApiProperty({ type: PubSubMessageDto })
  @IsObject()
  message: PubSubMessageDto;

  @ApiPropertyOptional({ description: 'Nom de l’abonnement Pub/Sub' })
  @IsOptional()
  @IsString()
  subscription?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deliveryAttempt?: string;
}
