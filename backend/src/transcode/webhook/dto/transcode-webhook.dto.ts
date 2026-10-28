import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { TranscodeStatus } from '../../../generated/prisma/client.js';

export const TRANSCODE_EVENTS = ['completed', 'failed'] as const;

export class TranscodeWebhookDto {
  @ApiProperty({ enum: TRANSCODE_EVENTS })
  @IsIn(TRANSCODE_EVENTS)
  event: (typeof TRANSCODE_EVENTS)[number];

  @ApiPropertyOptional({ format: 'uuid', description: 'Ciblage par identifiant d’épisode' })
  @IsOptional()
  @IsUUID()
  episodeId?: string;

  @ApiPropertyOptional({ description: 'Ciblage par identifiant de job chez le fournisseur' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  externalId?: string;

  @ApiPropertyOptional({
    description: 'Ciblage par clé du fichier maître',
    example: 'sources/<seriesId>/<episodeId>/ep1.mp4',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  sourceKey?: string;

  @ApiPropertyOptional({
    description: 'Clé (ou URL absolue) du manifeste maître ; défaut `hls/{episodeId}/master.m3u8`',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  hlsKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  previewKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  thumbnailUrl?: string;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  durationSeconds?: number;

  @ApiPropertyOptional({ description: 'Message d’erreur (événement `failed`)' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  error?: string;
}

export class TranscodeWebhookAckDto {
  @ApiProperty({ example: true })
  accepted: boolean;

  @ApiProperty({ format: 'uuid' })
  episodeId: string;

  @ApiProperty({ enum: Object.values(TranscodeStatus) })
  transcodeStatus: TranscodeStatus;
}
