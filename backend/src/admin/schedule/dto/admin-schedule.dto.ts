import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional } from 'class-validator';
import { SeriesStatus, TranscodeStatus } from '../../../generated/prisma/client.js';

export class ScheduleQueryDto {
  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Début de la fenêtre (défaut : maintenant)',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Fin de la fenêtre (défaut : + 30 jours)',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;
}

export class ScheduleItemDto {
  @ApiProperty({ enum: ['series', 'episode'] })
  kind: 'series' | 'episode';

  @ApiProperty({ format: 'uuid', description: 'Identifiant de la série ou de l’épisode' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  seriesId: string;

  @ApiProperty({ example: 'Le Secret du Lagon' })
  seriesTitle: string;

  @ApiProperty({ enum: Object.values(SeriesStatus) })
  seriesStatus: SeriesStatus;

  @ApiProperty({ type: Number, nullable: true, example: 4, description: 'Numéro (épisode)' })
  episodeNumber: number | null;

  @ApiProperty({ type: String, nullable: true, description: 'Titre (épisode)' })
  episodeTitle: string | null;

  @ApiProperty({
    enum: Object.values(TranscodeStatus),
    nullable: true,
    description: 'Statut de transcodage (épisode) : seul READY sera visible à la date',
  })
  transcodeStatus: TranscodeStatus | null;

  @ApiProperty({ format: 'date-time' })
  publishedAt: string;

  @ApiProperty({
    description:
      'Sera visible du public à la date (série publiée, épisode READY) ; sinon il manque une étape',
  })
  willBeVisible: boolean;
}

export class ScheduleDto {
  @ApiProperty({ format: 'date-time' })
  from: string;

  @ApiProperty({ format: 'date-time' })
  to: string;

  @ApiProperty({ type: [ScheduleItemDto], description: 'Triés par date de publication croissante' })
  items: ScheduleItemDto[];
}
