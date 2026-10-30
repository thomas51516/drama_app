import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '../../common/i18n/accept-language.js';
import { AgeRating, HomeRowType, SeriesStatus } from '../../generated/prisma/client.js';

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

  @ApiPropertyOptional({
    description: 'Série dans « Ma liste » du spectateur ; présent uniquement avec un jeton (M-16)',
  })
  isFavorite?: boolean;

  @ApiPropertyOptional({
    description: 'Nombre de « J’aime » ; présent uniquement avec un jeton (M-16)',
    example: 128,
  })
  likes?: number;
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

export class SubtitleTrackDto {
  @ApiProperty({ example: 'fr', description: 'Code ISO 639-1' })
  language: string;

  @ApiProperty({ example: 'Français', description: 'Nom de la langue, dans cette langue' })
  label: string;

  @ApiProperty({ description: 'URL publique du fichier WebVTT (CORS ouvert en lecture)' })
  url: string;
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

  @ApiProperty({ type: [String], example: ['fr', 'en'], deprecated: true })
  subtitleLanguages: string[];

  @ApiProperty({ type: [SubtitleTrackDto], description: 'Pistes de sous-titres (B-03)' })
  subtitles: SubtitleTrackDto[];

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  publishedAt: string | null;
}

/**
 * Bannière de l'accueil (B-05) : la série mise en avant (champs de `SeriesSummaryDto`, compatibles
 * avec la v1.0) enrichie des champs de la bannière configurée en back-office.
 */
export class HomeBannerDto extends SeriesSummaryDto {
  @ApiProperty({ format: 'uuid', description: 'Identifiant de la bannière' })
  bannerId: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Visuel 16:9 de la bannière (repli : affiche horizontale de la série)',
  })
  imageUrl: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Accroche (repli : titre de la série)',
  })
  bannerTitle: string | null;

  @ApiProperty({ type: String, nullable: true })
  bannerSubtitle: string | null;
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
    description:
      'Clé stable configurée en back-office (ex. trending, new, continue_watching, genre-romance)',
    example: 'trending',
  })
  key: string;

  @ApiProperty({ enum: Object.values(HomeRowType), description: 'Type de rangée (B-05)' })
  type: HomeRowType;

  @ApiProperty({
    description: 'Titre dans la langue de `Accept-Language` (fr, en, es, pt ; repli fr)',
    example: 'Tendances',
  })
  title: string;

  @ApiProperty({ type: [HomeItemDto] })
  items: HomeItemDto[];
}

export class HomeResponseDto {
  @ApiProperty({
    type: [HomeBannerDto],
    description: 'Bannières actives (M-01, B-05), filtrées par pays et fenêtre de diffusion',
  })
  banners: HomeBannerDto[];

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

export class SearchQueryDto {
  @ApiPropertyOptional({
    description:
      'Texte recherché (titre, synopsis, tags, genres ; accents ignorés). Facultatif si `genre` est fourni (DEF-002) : la liste du genre est alors renvoyée, des plus récentes aux plus anciennes.',
    minLength: 2,
    maxLength: 100,
  })
  @ValidateIf((o: SearchQueryDto) => o.q !== undefined || !o.genre)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  q?: string;

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

export class SearchSuggestQueryDto {
  @ApiProperty({ description: 'Préfixe saisi', minLength: 1, maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  q: string;
}

export class SearchSuggestionsDto {
  @ApiProperty({
    type: [String],
    description: 'Titres de séries publiées commençant par le préfixe (8 au plus)',
    example: ['Le Secret du Lagon'],
  })
  suggestions: string[];
}

export class SearchResponseDto extends PaginatedSeriesDto {
  @ApiProperty({ type: [String], description: 'Suggestions de titres (préfixe, 8 au plus)' })
  suggestions: string[];
}

export class LikeResultDto {
  @ApiProperty({ description: 'Nombre total de « J’aime » de la série', example: 129 })
  likes: number;

  @ApiProperty({ description: 'Le spectateur courant aime cette série' })
  liked: boolean;
}

export class FeedQueryDto {
  @ApiPropertyOptional({
    description:
      'Curseur opaque renvoyé par l’appel précédent (base64url) ; curseur illisible → 400 VALIDATION_ERROR (DEF-008)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Matches(/^[A-Za-z0-9_-]+$/, { message: 'cursor must be an opaque base64url token' })
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
    description:
      'Extrait de 15 s (HLS) lisible sans droit, signé comme `/play` (S04-BE-02) ; sinon appeler /episodes/{id}/play',
  })
  previewUrl: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    format: 'date-time',
    description: 'Expiration de `previewUrl` (redemander le flux ensuite)',
  })
  previewExpiresAt: string | null;

  @ApiProperty({ description: 'Série dans « Ma liste » du spectateur (false sans jeton)' })
  isFavorite: boolean;
}

export class FeedResponseDto {
  @ApiProperty({ type: [FeedItemDto] })
  items: FeedItemDto[];

  @ApiProperty({ type: String, nullable: true })
  nextCursor: string | null;
}

// ----------------------------------------------------------------------------- classements et genres (contrat v1.5)

export const RANKING_PERIODS = ['day', 'week', 'all'] as const;
export type RankingPeriod = (typeof RANKING_PERIODS)[number];

export class RankingsQueryDto {
  @ApiPropertyOptional({ enum: RANKING_PERIODS, default: 'week' })
  @IsOptional()
  @IsIn(RANKING_PERIODS)
  period: RankingPeriod = 'week';

  @ApiPropertyOptional({ example: 'romance', description: 'Clé de genre (voir `GET /genres`)' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  genre?: string;
}

export class RankingItemDto {
  @ApiProperty({ example: 1 })
  rank: number;

  @ApiProperty({ type: SeriesSummaryDto })
  series: SeriesSummaryDto;

  @ApiProperty({ example: 1280, description: 'Spectateurs distincts sur la période' })
  viewers: number;
}

export class RankingsDto {
  @ApiProperty({ enum: RANKING_PERIODS })
  period: RankingPeriod;

  @ApiProperty({ type: [RankingItemDto] })
  items: RankingItemDto[];
}

export class GenresQueryDto {
  @ApiPropertyOptional({
    enum: SUPPORTED_LANGUAGES,
    description: 'Langue des libellés (sinon `Accept-Language`)',
  })
  @IsOptional()
  @IsIn(SUPPORTED_LANGUAGES)
  lang?: SupportedLanguage;
}

export class GenreDto {
  @ApiProperty({ example: 'drame' })
  key: string;

  @ApiProperty({ example: 'Drama' })
  label: string;
}

export class GenresDto {
  @ApiProperty({ enum: SUPPORTED_LANGUAGES })
  lang: SupportedLanguage;

  @ApiProperty({ type: [GenreDto] })
  items: GenreDto[];
}
