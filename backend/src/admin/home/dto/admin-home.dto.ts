import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { SUPPORTED_LANGUAGES } from '../../../common/i18n/accept-language.js';
import { HomeRowType } from '../../../generated/prisma/client.js';
import { HomeResponseDto } from '../../../catalog/dto/catalog.dto.js';

const countryCodes = () =>
  Transform(({ value }: { value: unknown }) =>
    Array.isArray(value)
      ? (value as unknown[]).map((v) => (typeof v === 'string' ? v.trim().toUpperCase() : v))
      : value,
  );

const trimmed = () =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));

// ---------------------------------------------------------------------------
// Bannières
// ---------------------------------------------------------------------------

export class HomeBannerAdminDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  seriesId: string;

  @ApiProperty({ description: 'Titre de la série mise en avant (lecture seule)' })
  seriesTitle: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Visuel 16:9 ; null = affiche horizontale',
  })
  imageUrl: string | null;

  @ApiProperty({ type: String, nullable: true })
  title: string | null;

  @ApiProperty({ type: String, nullable: true })
  subtitle: string | null;

  @ApiProperty({ type: [String], description: 'ISO 3166-1 alpha-2 ; vide = partout' })
  countries: string[];

  @ApiProperty({ example: 1 })
  position: number;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  startsAt: string | null;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  endsAt: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt: string;
}

export class CreateHomeBannerDto {
  @ApiProperty({ format: 'uuid', description: 'Série mise en avant (doit exister)' })
  @IsUUID()
  seriesId: string;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'URL publique du visuel 16:9' })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUrl({ require_tld: false })
  @MaxLength(2048)
  imageUrl?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 200 })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @trimmed()
  @MaxLength(200)
  title?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 300 })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @trimmed()
  @MaxLength(300)
  subtitle?: string | null;

  @ApiPropertyOptional({ type: [String], example: ['TG', 'CI'], description: 'Vide = partout' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(250)
  @countryCodes()
  @Matches(/^[A-Z]{2}$/, { each: true, message: 'countries must be ISO 3166-1 alpha-2 codes' })
  countries?: string[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ type: String, nullable: true, format: 'date-time' })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsISO8601({ strict: true })
  startsAt?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, format: 'date-time' })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsISO8601({ strict: true })
  endsAt?: string | null;
}

export class UpdateHomeBannerDto extends PartialType(CreateHomeBannerDto) {}

// ---------------------------------------------------------------------------
// Rangées
// ---------------------------------------------------------------------------

export class HomeRowTitlesDto {
  @ApiProperty({ example: 'Tendances', description: 'Obligatoire (langue de repli)' })
  @IsString()
  @trimmed()
  @MinLength(1)
  @MaxLength(80)
  fr: string;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'Trending' })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @trimmed()
  @MaxLength(80)
  en?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'Tendencias' })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @trimmed()
  @MaxLength(80)
  es?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'Tendências' })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @trimmed()
  @MaxLength(80)
  pt?: string | null;
}

export class HomeRowTitlesResponseDto {
  @ApiProperty({ example: 'Tendances' })
  fr: string;

  @ApiProperty({ type: String, nullable: true })
  en: string | null;

  @ApiProperty({ type: String, nullable: true })
  es: string | null;

  @ApiProperty({ type: String, nullable: true })
  pt: string | null;
}

export class HomeRowAdminDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'trending', description: 'Clé stable exposée à l’application' })
  key: string;

  @ApiProperty({ enum: Object.values(HomeRowType) })
  type: HomeRowType;

  @ApiProperty({ type: HomeRowTitlesResponseDto })
  titles: HomeRowTitlesResponseDto;

  @ApiProperty({ type: String, nullable: true, description: 'Type GENRE' })
  genre: string | null;

  @ApiProperty({ type: [String], description: 'Type MANUAL : séries dans l’ordre d’affichage' })
  seriesIds: string[];

  @ApiProperty({ type: [String], description: 'ISO 3166-1 alpha-2 ; vide = partout' })
  countries: string[];

  @ApiProperty({ example: 1 })
  position: number;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt: string;
}

export class CreateHomeRowDto {
  @ApiProperty({
    example: 'genre-romance',
    description: 'Clé unique : minuscules, chiffres, `-` ou `_` (2 à 80 caractères)',
    pattern: '^[a-z0-9][a-z0-9_-]{1,79}$',
  })
  @IsString()
  @trimmed()
  @Matches(/^[a-z0-9][a-z0-9_-]{1,79}$/, {
    message: 'key must be 2-80 lowercase letters, digits, "-" or "_"',
  })
  key: string;

  @ApiProperty({ enum: Object.values(HomeRowType) })
  @IsEnum(HomeRowType)
  type: HomeRowType;

  @ApiProperty({
    type: HomeRowTitlesDto,
    description: `Titres par langue (${SUPPORTED_LANGUAGES.join(', ')})`,
  })
  @ValidateNested()
  @Type(() => HomeRowTitlesDto)
  titles: HomeRowTitlesDto;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'romance',
    description: 'Requis pour GENRE',
  })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @MinLength(1)
  @MaxLength(40)
  genre?: string | null;

  @ApiPropertyOptional({ type: [String], description: 'Requis (non vide) pour MANUAL' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  seriesIds?: string[];

  @ApiPropertyOptional({ type: [String], example: [], description: 'Vide = partout' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(250)
  @countryCodes()
  @Matches(/^[A-Z]{2}$/, { each: true, message: 'countries must be ISO 3166-1 alpha-2 codes' })
  countries?: string[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateHomeRowDto extends PartialType(CreateHomeRowDto) {}

// ---------------------------------------------------------------------------
// Ordre et aperçu
// ---------------------------------------------------------------------------

export class ReorderHomeItemsDto {
  @ApiProperty({
    type: [String],
    description: 'Tous les identifiants (bannières ou rangées) dans le nouvel ordre',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  ids: string[];
}

export class HomePreviewQueryDto {
  @ApiPropertyOptional({ example: 'TG', description: 'Pays simulé (ISO 3166-1 alpha-2)' })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @Matches(/^[A-Z]{2}$/, { message: 'country must be an ISO 3166-1 alpha-2 code' })
  country?: string;

  @ApiPropertyOptional({ enum: SUPPORTED_LANGUAGES, default: 'fr' })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @Matches(/^(fr|en|es|pt)$/, { message: 'lang must be one of fr, en, es, pt' })
  lang?: 'fr' | 'en' | 'es' | 'pt';
}

export { HomeResponseDto };
