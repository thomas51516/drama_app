import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { AgeRating, SeriesStatus } from '../../generated/prisma/client.js';

export const EPISODE_ACCESS = ['free', 'unlocked', 'locked'] as const;
export type EpisodeAccess = (typeof EPISODE_ACCESS)[number];

export class SeriesSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'le-secret-du-lagon' })
  slug: string;

  @ApiProperty({ example: 'Le Secret du Lagon' })
  title: string;

  @ApiProperty({ type: [String], example: ['romance', 'drame'] })
  genres: string[];

  @ApiProperty({ type: String, nullable: true, description: 'Affiche 9:16' })
  posterVerticalUrl: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Affiche 16:9 (bannières)' })
  posterHorizontalUrl: string | null;

  @ApiProperty({ description: 'Nombre d’épisodes publiés et prêts', example: 3 })
  episodeCount: number;

  @ApiProperty({ example: 2 })
  freeEpisodeCount: number;

  @ApiProperty({ description: 'Coût en pièces d’un épisode payant', example: 10 })
  coinCostPerEpisode: number;

  @ApiProperty({ enum: Object.values(AgeRating) })
  ageRating: AgeRating;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  publishedAt: string | null;
}

export class SeriesDetailDto extends SeriesSummaryDto {
  @ApiProperty()
  synopsis: string;

  @ApiProperty({ type: [String] })
  tags: string[];

  @ApiProperty({ example: 'fr' })
  originalLanguage: string;

  @ApiProperty({ enum: Object.values(SeriesStatus) })
  status: SeriesStatus;
}

export class EpisodeSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  seriesId: string;

  @ApiProperty({ example: 1 })
  number: number;

  @ApiProperty({ type: String, nullable: true })
  title: string | null;

  @ApiProperty({ example: 95 })
  durationSeconds: number;

  @ApiProperty({ type: String, nullable: true })
  thumbnailUrl: string | null;

  @ApiProperty({
    enum: EPISODE_ACCESS,
    description:
      'Statut pour le spectateur courant (M-10). Sans jeton : `free` ou `locked` seulement.',
  })
  access: EpisodeAccess;

  @ApiProperty({ description: 'Coût en pièces pour débloquer (0 si gratuit ou déjà débloqué)' })
  coinCost: number;

  @ApiProperty({ type: [String], example: ['fr', 'en'] })
  subtitleLanguages: string[];

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  publishedAt: string | null;
}

export class HomeItemDto {
  @ApiProperty({ type: SeriesSummaryDto })
  series: SeriesSummaryDto;

  @ApiPropertyOptional({
    type: EpisodeSummaryDto,
    description: 'Présent dans la rangée « Continuer à regarder »',
  })
  episode?: EpisodeSummaryDto;

  @ApiPropertyOptional({
    description: 'Position de reprise en secondes (« Continuer à regarder »)',
  })
  positionSeconds?: number;
}

export class HomeRowDto {
  @ApiProperty({
    description: 'Clé stable : trending, new, continue_watching, genre:<genre>',
    example: 'trending',
  })
  key: string;

  @ApiProperty({ description: 'Titre affichable (langue du spectateur)', example: 'Tendances' })
  title: string;

  @ApiProperty({ type: [HomeItemDto] })
  items: HomeItemDto[];
}

export class HomeResponseDto {
  @ApiProperty({ type: [SeriesSummaryDto], description: 'Bannières de mise en avant (M-01)' })
  banners: SeriesSummaryDto[];

  @ApiProperty({ type: [HomeRowDto] })
  rows: HomeRowDto[];
}

export class ListSeriesQueryDto {
  @ApiPropertyOptional({ description: 'Filtre par genre', example: 'romance' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  genre?: string;

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

export class PaginatedSeriesDto {
  @ApiProperty({ type: [SeriesSummaryDto] })
  items: SeriesSummaryDto[];

  @ApiProperty()
  page: number;

  @ApiProperty()
  pageSize: number;

  @ApiProperty()
  total: number;
}

export class FeedQueryDto {
  @ApiPropertyOptional({ description: 'Curseur opaque renvoyé par l’appel précédent' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;

  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  limit: number = 10;
}

export class FeedItemDto {
  @ApiProperty({ type: SeriesSummaryDto })
  series: SeriesSummaryDto;

  @ApiProperty({ type: EpisodeSummaryDto, description: 'Premier épisode (gratuit) de la série' })
  episode: EpisodeSummaryDto;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Extrait de 15 s (HLS) lisible sans droit ; sinon appeler /episodes/{id}/play',
  })
  previewUrl: string | null;
}

export class FeedResponseDto {
  @ApiProperty({ type: [FeedItemDto] })
  items: FeedItemDto[];

  @ApiProperty({ type: String, nullable: true })
  nextCursor: string | null;
}
