import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  Length,
  ValidateNested,
} from 'class-validator';

/** Plan de marquage minimal (cahier des charges §13) + événements de compte et de partage. */
export const ANALYTICS_EVENT_NAMES = [
  'app_open',
  'series_view',
  'episode_start',
  'episode_complete',
  'paywall_view',
  'unlock',
  'purchase',
  'subscription_start',
  'ad_reward',
  'checkin',
  'push_open',
  'login',
  'signup',
  'share',
  'search',
] as const;
export type AnalyticsEventName = (typeof ANALYTICS_EVENT_NAMES)[number];

/** Taille maximale des paramètres sérialisés d'un événement. */
export const ANALYTICS_PARAMS_MAX_BYTES = 2048;
export const ANALYTICS_BATCH_MAX = 50;

export class AnalyticsEventInputDto {
  @ApiProperty({ enum: ANALYTICS_EVENT_NAMES, example: 'episode_start' })
  @IsIn(ANALYTICS_EVENT_NAMES)
  name: AnalyticsEventName;

  @ApiPropertyOptional({
    type: Object,
    description: `Paramètres libres (objet JSON, ${ANALYTICS_PARAMS_MAX_BYTES} octets max)`,
    example: { seriesId: '0192…', episodeNumber: 3 },
  })
  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>;

  @ApiProperty({ format: 'date-time', description: 'Horodatage côté appareil' })
  @IsISO8601({ strict: true })
  at: string;
}

export class PostEventsDto {
  @ApiProperty({ type: [AnalyticsEventInputDto], maxItems: ANALYTICS_BATCH_MAX })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(ANALYTICS_BATCH_MAX)
  @ValidateNested({ each: true })
  @Type(() => AnalyticsEventInputDto)
  events: AnalyticsEventInputDto[];

  @ApiPropertyOptional({ maxLength: 64, description: 'Identifiant de session de l’app' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  sessionId?: string;

  @ApiPropertyOptional({ maxLength: 40, example: '1.4.0' })
  @IsOptional()
  @IsString()
  @Length(1, 40)
  appVersion?: string;
}

export class PostEventsResultDto {
  @ApiProperty({ description: 'Événements enregistrés' })
  accepted: number;
}
