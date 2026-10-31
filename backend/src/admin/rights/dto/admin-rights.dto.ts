import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { SeriesStatus } from '../../../generated/prisma/client.js';
import { type RightsStatus } from '../rights-status.js';

const RIGHTS_STATUS_VALUES: RightsStatus[] = ['NONE', 'ACTIVE', 'EXPIRED'];

export class RightsContractDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  seriesId: string;

  @ApiProperty({ example: 'Le client' })
  rightsHolder: string;

  @ApiProperty({ type: [String], example: [], description: 'ISO 3166-1 alpha-2 ; vide = monde' })
  territories: string[];

  @ApiProperty({ format: 'date-time' })
  licenseStartsAt: string;

  @ApiProperty({
    type: String,
    nullable: true,
    format: 'date-time',
    description: 'null = durée indéterminée',
  })
  licenseEndsAt: string | null;

  @ApiProperty({ type: String, nullable: true })
  notes: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt: string;
}

export class CreateRightsContractDto {
  @ApiProperty({ minLength: 1, maxLength: 200, example: 'Le client' })
  @IsString()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(1)
  @MaxLength(200)
  rightsHolder: string;

  @ApiPropertyOptional({
    type: [String],
    example: [],
    description: 'ISO 3166-1 alpha-2 ; vide = monde',
  })
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

  @ApiProperty({ format: 'date-time', example: '2026-10-31T00:00:00.000Z' })
  @IsISO8601({ strict: true })
  licenseStartsAt: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    format: 'date-time',
    description: 'null ou absent = durée indéterminée',
  })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsISO8601({ strict: true })
  licenseEndsAt?: string | null;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateRightsContractDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 200, example: 'Le client' })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(1)
  @MaxLength(200)
  rightsHolder?: string;

  @ApiPropertyOptional({ type: [String], description: 'ISO 3166-1 alpha-2 ; vide = monde' })
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

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601({ strict: true })
  licenseStartsAt?: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    format: 'date-time',
    description: 'null = durée indéterminée',
  })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsISO8601({ strict: true })
  licenseEndsAt?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 2000 })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

export class RightsContractListQueryDto {
  @ApiPropertyOptional({
    minimum: 0,
    maximum: 3650,
    description:
      'Ne garder que les séries nécessitant une attention : sans contrat (NONE), hors fenêtre (EXPIRED), ou dont la licence se termine dans ce nombre de jours.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(3650)
  expiringWithinDays?: number;
}

export class RightsContractListItemDto {
  @ApiProperty({ format: 'uuid' })
  seriesId: string;

  @ApiProperty({ example: 'La Nounou' })
  seriesTitle: string;

  @ApiProperty({ enum: Object.values(SeriesStatus) })
  seriesStatus: SeriesStatus;

  @ApiProperty({ enum: RIGHTS_STATUS_VALUES })
  rightsStatus: RightsStatus;

  @ApiProperty({ type: RightsContractDto, nullable: true })
  contract: RightsContractDto | null;
}

export class RightsContractListDto {
  @ApiProperty({ type: [RightsContractListItemDto] })
  items: RightsContractListItemDto[];

  @ApiProperty()
  total: number;
}
