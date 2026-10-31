import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsBoolean,
  IsArray,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { AgeRating, SeriesStatus } from '../../../generated/prisma/client.js';
import { RightsContractDto } from '../../rights/dto/admin-rights.dto.js';
import { type RightsStatus } from '../../rights/rights-status.js';

const RIGHTS_STATUS_VALUES: RightsStatus[] = ['NONE', 'ACTIVE', 'EXPIRED'];

const trimStrings = () =>
  Transform(({ value }: { value: unknown }) =>
    Array.isArray(value)
      ? (value as unknown[]).map((v) => (typeof v === 'string' ? v.trim() : v))
      : value,
  );

export class AdminSeriesDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'le-secret-du-lagon' })
  slug: string;

  @ApiProperty({ example: 'Le Secret du Lagon' })
  title: string;

  @ApiProperty()
  synopsis: string;

  @ApiProperty({ type: [String], example: ['romance', 'drame'] })
  genres: string[];

  @ApiProperty({ type: [String], example: ['héritage', 'famille'] })
  tags: string[];

  @ApiProperty({ example: 'fr', description: 'Langue originale (BCP 47 court)' })
  language: string;

  @ApiProperty({ enum: Object.values(AgeRating) })
  ageRating: AgeRating;

  @ApiProperty({ type: String, nullable: true })
  posterVerticalUrl: string | null;

  @ApiProperty({ type: String, nullable: true })
  posterHorizontalUrl: string | null;

  @ApiProperty({ example: 5 })
  freeEpisodeCount: number;

  @ApiProperty({ example: 10 })
  coinCostPerEpisode: number;

  @ApiProperty({ description: 'Déblocage par pub récompensée autorisé (M-22, contrat v1.5)' })
  adUnlockEnabled: boolean;

  @ApiProperty({ enum: Object.values(SeriesStatus) })
  status: SeriesStatus;

  @ApiProperty({ type: [String], example: [], description: 'ISO 3166-1 alpha-2 ; vide = monde' })
  territories: string[];

  @ApiProperty({ description: "Nombre total d'épisodes (tous statuts)", example: 12 })
  episodeCount: number;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  publishedAt: string | null;

  @ApiProperty({
    enum: RIGHTS_STATUS_VALUES,
    description:
      'Calculé (B-12) : NONE = pas de contrat, ACTIVE = dans la fenêtre de licence, EXPIRED = contrat hors fenêtre (licence terminée ou pas encore commencée). Ne bloque jamais la publication.',
  })
  rightsStatus: RightsStatus;

  @ApiProperty({ type: RightsContractDto, nullable: true })
  rightsContract: RightsContractDto | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt: string;
}

export class CreateAdminSeriesDto {
  @ApiProperty({ minLength: 1, maxLength: 200, example: 'Le Secret du Lagon' })
  @IsString()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional({ maxLength: 5000, default: '' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  synopsis?: string;

  @ApiPropertyOptional({ type: [String], example: ['romance', 'drame'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @trimStrings()
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  genres?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @trimStrings()
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];

  @ApiPropertyOptional({ example: 'fr', default: 'fr' })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/, { message: 'language must be a BCP 47 tag' })
  language?: string;

  @ApiPropertyOptional({ enum: Object.values(AgeRating), default: 'ALL' })
  @IsOptional()
  @IsEnum(AgeRating)
  ageRating?: AgeRating;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'URL publique (affiche 9:16)' })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUrl({ require_tld: false })
  @MaxLength(2048)
  posterVerticalUrl?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'URL publique (affiche 16:9)' })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUrl({ require_tld: false })
  @MaxLength(2048)
  posterHorizontalUrl?: string | null;

  @ApiPropertyOptional({ minimum: 0, maximum: 1000, description: 'Rôles MONETIZATION et ADMIN' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  freeEpisodeCount?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 10000, description: 'Rôles MONETIZATION et ADMIN' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000)
  coinCostPerEpisode?: number;

  @ApiPropertyOptional({
    default: true,
    description:
      'Déblocage par pub récompensée autorisé sur la série (rôles MONETIZATION et ADMIN)',
  })
  @IsOptional()
  @IsBoolean()
  adUnlockEnabled?: boolean;

  @ApiPropertyOptional({ type: [String], example: ['TG', 'CI'], description: 'Vide = monde' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(250)
  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value)
      ? (value as unknown[]).map((v) => (typeof v === 'string' ? v.trim().toUpperCase() : v))
      : value,
  )
  @Matches(/^[A-Z]{2}$/, { each: true, message: 'territories must be ISO 3166-1 alpha-2 codes' })
  territories?: string[];
}

export class UpdateAdminSeriesDto extends PartialType(CreateAdminSeriesDto) {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    format: 'date-time',
    description:
      'Date de publication, future acceptée (publication programmée, B-04) : une série publiée reste invisible du public tant que la date n’est pas atteinte ; `null` efface la date (la série publiée redevient invisible).',
  })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsISO8601({ strict: true })
  publishedAt?: string | null;
}

export class ListAdminSeriesQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;

  @ApiPropertyOptional({ enum: Object.values(SeriesStatus) })
  @IsOptional()
  @IsEnum(SeriesStatus)
  status?: SeriesStatus;

  @ApiPropertyOptional({ description: 'Recherche sur le titre et le slug', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}

export class AdminSeriesListDto {
  @ApiProperty({ type: [AdminSeriesDto] })
  items: AdminSeriesDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  pageSize: number;
}
