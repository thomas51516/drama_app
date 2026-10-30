import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { NOTIFICATION_TYPES } from '../push.types.js';

export const PUSH_PLATFORMS = ['android'] as const;

/** `PUT /me/devices/push` (contrat v1.3). */
export class RegisterPushDeviceDto {
  @ApiProperty({ description: 'Jeton FCM de l’appareil', maxLength: 512 })
  @IsString()
  @Length(10, 512)
  token: string;

  @ApiProperty({ enum: PUSH_PLATFORMS, example: 'android' })
  @IsIn(PUSH_PLATFORMS)
  platform: (typeof PUSH_PLATFORMS)[number];

  @ApiPropertyOptional({ example: 'fr-FR', maxLength: 16 })
  @IsOptional()
  @IsString()
  @Length(2, 16)
  locale?: string;

  @ApiPropertyOptional({ example: '1.4.0', maxLength: 40 })
  @IsOptional()
  @IsString()
  @Length(1, 40)
  appVersion?: string;
}

export class NotificationsQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize: number = 20;
}

export class NotificationDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: NOTIFICATION_TYPES, example: 'new_episode' })
  type: string;

  @ApiProperty({ example: 'Nouvel épisode de Le Secret du Lagon' })
  title: string;

  @ApiProperty({ example: 'L’épisode 6 est disponible.' })
  body: string;

  @ApiProperty({
    type: Object,
    nullable: true,
    description: 'Routage : `{ seriesId, episodeId }`, `{ ticketId }` ou `{ deepLink }`',
    example: { seriesId: '0192…', episodeId: '0192…' },
  })
  data: Record<string, unknown> | null;

  @ApiProperty({ format: 'date-time' })
  sentAt: string;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  readAt: string | null;
}

export class NotificationsPageDto {
  @ApiProperty({ type: [NotificationDto], description: 'De la plus récente à la plus ancienne' })
  items: NotificationDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  pageSize: number;

  @ApiProperty({ description: 'Notifications non lues (toutes pages)' })
  unreadCount: number;
}
