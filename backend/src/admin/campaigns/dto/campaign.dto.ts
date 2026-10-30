import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { CampaignSegmentType, CampaignStatus } from '../../../generated/prisma/client.js';

export class CampaignSegmentDto {
  @ApiProperty({ enum: Object.values(CampaignSegmentType) })
  @IsEnum(CampaignSegmentType)
  type: CampaignSegmentType;

  @ApiPropertyOptional({
    type: [String],
    description: 'Segment COUNTRY : pays ISO 3166-1 alpha-2',
    example: ['TG', 'CI'],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(60)
  @Matches(/^[A-Za-z]{2}$/, { each: true })
  countries?: string[];

  @ApiPropertyOptional({ format: 'uuid', description: 'Segment SERIES_FOLLOWERS : série suivie' })
  @IsOptional()
  @IsUUID()
  seriesId?: string;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 365,
    description: 'Segment INACTIVE : sans session ni lecture depuis N jours',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  inactiveDays?: number;
}

export class CreateCampaignDto {
  @ApiProperty({ maxLength: 200, example: 'Nouvelle saison ce week-end' })
  @IsString()
  @Length(1, 200)
  title: string;

  @ApiProperty({ maxLength: 1000 })
  @IsString()
  @Length(1, 1000)
  body: string;

  @ApiPropertyOptional({ maxLength: 500, example: 'drama://series/0192…' })
  @IsOptional()
  @IsString()
  @Length(1, 500)
  deepLink?: string;

  @ApiProperty({ type: CampaignSegmentDto })
  @ValidateNested()
  @Type(() => CampaignSegmentDto)
  segment: CampaignSegmentDto;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Envoi programmé (appliqué par `POST /send`) ; absent = envoi immédiat au `send`',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  scheduledAt?: string;
}

export class UpdateCampaignDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @Length(1, 200)
  title?: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @Length(1, 1000)
  body?: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 500 })
  @IsOptional()
  @IsString()
  @Length(1, 500)
  deepLink?: string | null;

  @ApiPropertyOptional({ type: CampaignSegmentDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CampaignSegmentDto)
  segment?: CampaignSegmentDto;

  @ApiPropertyOptional({ type: String, nullable: true, format: 'date-time' })
  @IsOptional()
  @IsISO8601({ strict: true })
  scheduledAt?: string | null;
}

export class ListCampaignsQueryDto {
  @ApiPropertyOptional({ enum: Object.values(CampaignStatus) })
  @IsOptional()
  @IsEnum(CampaignStatus)
  status?: CampaignStatus;

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
}

export class CampaignDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  body: string;

  @ApiProperty({ type: String, nullable: true })
  deepLink: string | null;

  @ApiProperty({ type: CampaignSegmentDto })
  segment: CampaignSegmentDto;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  scheduledAt: string | null;

  @ApiProperty({ enum: Object.values(CampaignStatus) })
  status: CampaignStatus;

  @ApiProperty({ description: 'Audience estimée (brouillon) puis réellement parcourue (envoi)' })
  audienceCount: number;

  @ApiProperty({ description: 'Utilisateurs ayant reçu au moins un push' })
  sentCount: number;

  @ApiProperty({ type: String, nullable: true, description: 'E-mail du compte créateur' })
  createdBy: string | null;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  sentAt: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt: string;
}

export class CampaignListDto {
  @ApiProperty({ type: [CampaignDto] })
  items: CampaignDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  pageSize: number;
}

export class CampaignEstimateDto {
  @ApiProperty({ description: 'Utilisateurs actifs avec appareil, préférence « offres » active' })
  audienceCount: number;
}
