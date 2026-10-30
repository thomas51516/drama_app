import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { AdSessionStatus } from '../../generated/prisma/client.js';

export const AD_INELIGIBILITY_REASONS = [
  'CAP_REACHED',
  'SERIES_NOT_ELIGIBLE',
  'ALREADY_UNLOCKED',
  'NO_PROVIDER',
] as const;
export type AdIneligibilityReason = (typeof AD_INELIGIBILITY_REASONS)[number];

export const AD_PROVIDERS = ['fake', 'admob'] as const;

export class AdEligibilityQueryDto {
  @ApiProperty({ format: 'uuid', description: 'Épisode que la pub débloquerait' })
  @IsUUID('all', { message: 'episodeId must be a UUID' })
  episodeId: string;
}

/** `GET /ads/eligibility` (contrat v1.5). */
export class AdEligibilityDto {
  @ApiProperty()
  eligible: boolean;

  @ApiProperty({
    example: 2,
    description: 'Pubs récompensées restantes aujourd’hui (fuseau du pays)',
  })
  remainingToday: number;

  @ApiProperty({ example: 3, description: 'Plafond quotidien (`adDailyCap`)' })
  dailyCap: number;

  @ApiPropertyOptional({ enum: AD_INELIGIBILITY_REASONS })
  reason?: AdIneligibilityReason;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'ca-app-pub-3940256099942544/5224354917',
    description: 'Bloc d’annonce récompensée à charger ; `fake-rewarded` avec la régie simulée',
  })
  adUnitId: string | null;

  @ApiProperty({ enum: AD_PROVIDERS })
  provider: (typeof AD_PROVIDERS)[number];
}

export class CreateAdSessionDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all', { message: 'episodeId must be a UUID' })
  episodeId: string;
}

/** `POST /ads/sessions` : à transmettre à la régie en `customData` SSV (et `userId` = compte). */
export class AdSessionCreatedDto {
  @ApiProperty({ format: 'uuid' })
  sessionId: string;

  @ApiProperty({
    example: '0192f3b2-…:7c1f…',
    description: 'Valeur `custom_data` à passer à la régie (session + nonce)',
  })
  customData: string;

  @ApiProperty({ format: 'date-time', description: 'Session valable 10 minutes' })
  expiresAt: string;
}

export class AdSessionStatusDto {
  @ApiProperty({ enum: Object.values(AdSessionStatus) })
  status: AdSessionStatus;

  @ApiProperty({ description: 'Épisode débloqué pour le compte (toutes méthodes confondues)' })
  unlocked: boolean;
}

/** Réponse du callback SSV : 200 systématique une fois la signature vérifiée (la régie rejoue les non-200). */
export class AdRewardAckDto {
  @ApiProperty({ description: 'Déblocage créé (ou déjà créé pour cette transaction)' })
  accepted: boolean;

  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  episodeId: string | null;

  @ApiPropertyOptional({
    example: 'session_expired',
    description:
      'Motif de refus : unknown_session, user_mismatch, session_expired, session_closed, cap_reached',
  })
  reason?: string;
}
