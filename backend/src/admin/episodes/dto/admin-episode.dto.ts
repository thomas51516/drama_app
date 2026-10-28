import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { TranscodeStatus } from '../../../generated/prisma/client.js';

export const SOURCE_CONTENT_TYPES = ['video/mp4', 'video/quicktime'] as const;
export const POSTER_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
/** Taille maximale d'un fichier maître : 2 Go (contrat admin v1). */
export const MAX_SOURCE_BYTES = 2 * 1024 * 1024 * 1024;

export class AdminEpisodeDto {
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

  @ApiProperty({ enum: Object.values(TranscodeStatus) })
  transcodeStatus: TranscodeStatus;

  @ApiProperty({ type: String, nullable: true, example: 'sources/<seriesId>/<episodeId>/ep1.mp4' })
  sourceKey: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'hls/<episodeId>/master.m3u8' })
  hlsKey: string | null;

  @ApiProperty({ type: String, nullable: true })
  thumbnailUrl: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'hls/<episodeId>/preview/index.m3u8' })
  previewKey: string | null;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  publishedAt: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Dernière erreur (statut FAILED)' })
  transcodeError: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt: string;
}

export class CreateAdminEpisodeDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ minimum: 1, description: 'Défaut : max + 1' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100_000)
  number?: number;
}

export class UpdateAdminEpisodeDto {
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 200 })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(200)
  title?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    format: 'date-time',
    description: 'Date de publication (programmable, B-04) ; `null` pour dépublier',
  })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsISO8601({ strict: true })
  publishedAt?: string | null;
}

export class ReorderEpisodesDto {
  @ApiProperty({
    type: [String],
    description:
      'Tous les identifiants d’épisodes de la série, dans le nouvel ordre (renumérotés 1..n)',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5000)
  @IsUUID('all', { each: true })
  episodeIds: string[];
}

export class EpisodeUploadUrlDto {
  @ApiProperty({ example: 'ep01-master.mp4', maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Matches(/\.(mp4|mov|m4v)$/i, { message: 'fileName must end with .mp4, .mov or .m4v' })
  fileName: string;

  @ApiProperty({ enum: SOURCE_CONTENT_TYPES })
  @IsIn(SOURCE_CONTENT_TYPES)
  contentType: (typeof SOURCE_CONTENT_TYPES)[number];

  @ApiProperty({
    minimum: 1,
    maximum: MAX_SOURCE_BYTES,
    description: 'Taille en octets (max 2 Go)',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_SOURCE_BYTES, { message: 'sizeBytes must not exceed 2 GiB' })
  sizeBytes: number;
}

export class UploadTargetDto {
  @ApiProperty({ description: 'URL pré-signée : le navigateur fait un PUT direct du fichier' })
  uploadUrl: string;

  @ApiProperty({ enum: ['PUT'] })
  method: 'PUT';

  @ApiProperty({
    description: 'En-têtes à envoyer avec le PUT',
    type: 'object',
    additionalProperties: { type: 'string' },
    example: { 'Content-Type': 'video/mp4' },
  })
  headers: Record<string, string>;

  @ApiProperty({ example: 'sources/<seriesId>/<episodeId>/ep01-master.mp4' })
  sourceKey: string;

  @ApiProperty({ format: 'date-time' })
  expiresAt: string;
}

export class PresignUploadDto {
  @ApiProperty({ enum: ['poster'] })
  @IsIn(['poster'])
  kind: 'poster';

  @ApiProperty({ example: 'affiche.jpg', maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  fileName: string;

  @ApiProperty({ enum: POSTER_CONTENT_TYPES })
  @IsIn(POSTER_CONTENT_TYPES)
  contentType: (typeof POSTER_CONTENT_TYPES)[number];
}

export class PresignedUploadDto {
  @ApiProperty()
  uploadUrl: string;

  @ApiProperty({ enum: ['PUT'] })
  method: 'PUT';

  @ApiProperty({ type: 'object', additionalProperties: { type: 'string' } })
  headers: Record<string, string>;

  @ApiProperty({ example: 'posters/0192f1f0-8a5b-7c3d-9e1f-abcdefabcdef/affiche.jpg' })
  key: string;

  @ApiProperty({
    description: 'URL publique à enregistrer dans `posterVerticalUrl` / `posterHorizontalUrl`',
    example:
      'http://localhost:9000/drama-media/posters/0192f1f0-8a5b-7c3d-9e1f-abcdefabcdef/affiche.jpg',
  })
  publicUrl: string;

  @ApiProperty({ format: 'date-time' })
  expiresAt: string;
}
