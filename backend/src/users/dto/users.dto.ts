import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { SeriesSummaryDto } from '../../catalog/dto/catalog.dto.js';

export class NotificationPreferencesUpdateDto {
  @ApiPropertyOptional({ description: 'Nouvel épisode d’une série suivie (M-54)' })
  @IsOptional()
  @IsBoolean()
  newEpisodes?: boolean;

  @ApiPropertyOptional({ description: 'Offres et promotions' })
  @IsOptional()
  @IsBoolean()
  offers?: boolean;

  @ApiPropertyOptional({ description: 'Rappel de check-in quotidien' })
  @IsOptional()
  @IsBoolean()
  checkinReminder?: boolean;
}

/** `PATCH /me` (contrat public v1.2) ; les champs absents sont inchangés. */
export class UpdateMeDto {
  @ApiPropertyOptional({ maxLength: 80, example: 'Awa' })
  @IsOptional()
  @IsString()
  @Length(1, 80)
  displayName?: string;

  @ApiPropertyOptional({ example: 'fr', description: 'fr, en, es ou pt' })
  @IsOptional()
  @IsString()
  @Matches(/^(fr|en|es|pt)$/, { message: 'language must be one of fr, en, es, pt' })
  language?: string;

  @ApiPropertyOptional({ example: 'TG', description: 'ISO 3166-1 alpha-2' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{2}$/)
  country?: string;

  @ApiPropertyOptional({ type: NotificationPreferencesUpdateDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationPreferencesUpdateDto)
  notificationPreferences?: NotificationPreferencesUpdateDto;

  @ApiPropertyOptional({ description: 'Déblocage automatique de l’épisode suivant (§3)' })
  @IsOptional()
  @IsBoolean()
  autoUnlock?: boolean;
}

export class DeleteMeResultDto {
  @ApiProperty({
    format: 'date-time',
    description:
      'Date d’anonymisation : le compte est désactivé immédiatement et ses jetons révoqués ; se reconnecter puis `POST /me/delete/cancel` avant cette date annule la suppression (§14).',
  })
  scheduledFor: string;
}

export class FavoritesQueryDto {
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

export class FavoritesPageDto {
  @ApiProperty({ type: [SeriesSummaryDto], description: 'Du plus récent au plus ancien ajout' })
  items: SeriesSummaryDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  pageSize: number;
}
