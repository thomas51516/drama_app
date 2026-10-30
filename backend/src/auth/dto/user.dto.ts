import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserStatus, UserType } from '../../generated/prisma/client.js';

export const AUTH_PROVIDERS = ['google', 'phone', 'email'] as const;
export type AuthProvider = (typeof AUTH_PROVIDERS)[number];

export const VIP_STATUSES = ['none', 'active', 'expired'] as const;
export type VipStatus = (typeof VIP_STATUSES)[number];

export class NotificationPreferencesDto {
  @ApiPropertyOptional({ description: 'Nouvel épisode d’une série suivie (M-54)', default: true })
  newEpisodes?: boolean;

  @ApiPropertyOptional({ description: 'Offres et promotions', default: true })
  offers?: boolean;

  @ApiPropertyOptional({ description: 'Rappel de check-in quotidien', default: true })
  checkinReminder?: boolean;
}

/** Profil utilisateur (contrat public v1.2 `UserDto`). */
export class UserDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: Object.values(UserType) })
  type: UserType;

  @ApiProperty({
    enum: Object.values(UserStatus),
    description: '`DELETION_PENDING` : suppression programmée (voir `deletionScheduledAt`)',
  })
  status: UserStatus;

  @ApiProperty({ type: String, nullable: true, example: 'Awa' })
  displayName: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'awa@example.com' })
  email: string | null;

  @ApiProperty({ type: String, nullable: true, example: '+22890000000' })
  phone: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'TG' })
  country: string | null;

  @ApiProperty({ example: 'fr' })
  language: string;

  @ApiProperty({ enum: VIP_STATUSES, description: 'none, active ou expired' })
  vipStatus: VipStatus;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  vipExpiresAt: string | null;

  @ApiProperty({
    enum: AUTH_PROVIDERS,
    isArray: true,
    description: 'Moyens de connexion rattachés (vide pour un invité)',
    example: ['google'],
  })
  providers: AuthProvider[];

  @ApiProperty({ description: 'Déblocage automatique de l’épisode suivant si le solde le permet' })
  autoUnlock: boolean;

  @ApiProperty({ type: NotificationPreferencesDto, nullable: true })
  notificationPreferences: NotificationPreferencesDto | null;

  @ApiProperty({
    type: String,
    nullable: true,
    format: 'date-time',
    description: 'Date d’anonymisation prévue (statut DELETION_PENDING)',
  })
  deletionScheduledAt: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;
}
