import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { EPISODE_ACCESS, type EpisodeAccess } from '../../catalog/dto/catalog.dto.js';

export class PlaySubtitleDto {
  @ApiProperty({ example: 'fr', description: 'Code ISO 639-1' })
  language: string;

  @ApiProperty({ example: 'Français', description: 'Nom de la langue, dans cette langue' })
  label: string;

  @ApiProperty({ description: 'URL publique du fichier WebVTT (CORS ouvert en lecture)' })
  url: string;
}

export class PlayDrmDto {
  @ApiProperty({
    enum: ['none', 'aes-128', 'widevine'],
    description: 'Protection du flux. `widevine` sur les épisodes payants (S10-BE-05).',
  })
  type: 'none' | 'aes-128' | 'widevine';

  @ApiPropertyOptional({ description: 'URL du serveur de licences Widevine' })
  licenseUrl?: string;
}

export class PlaySessionDto {
  @ApiProperty({ format: 'uuid' })
  episodeId: string;

  @ApiProperty({ format: 'uuid' })
  seriesId: string;

  @ApiProperty({ example: 3 })
  episodeNumber: number;

  @ApiProperty({ enum: EPISODE_ACCESS.filter((a) => a !== 'locked') })
  access: Exclude<EpisodeAccess, 'locked'>;

  @ApiProperty({
    description:
      'URL du manifeste HLS maître, signée et expirante (S04-BE-02). Mode `hmac` : `?token=<base64url(hmac-sha256(secret, chemin du dossier + expires))>&expires=<epoch>` ; mode `plain` (dev MinIO) : URL publique.',
    example: 'https://cdn.example.com/hls/0192.../master.m3u8?token=...&expires=1761732000',
  })
  manifestUrl: string;

  @ApiProperty({
    format: 'date-time',
    description: "Expiration de l'URL ; redemander /play ensuite ou sur une erreur 403 du CDN.",
  })
  expiresAt: string;

  @ApiProperty({ type: PlayDrmDto })
  drm: PlayDrmDto;

  @ApiProperty({ type: [PlaySubtitleDto] })
  subtitles: PlaySubtitleDto[];

  @ApiProperty({
    description: 'Position de reprise (M-15), 0 si jamais vu ou terminé',
    example: 42,
  })
  resumePositionSeconds: number;

  @ApiProperty({ example: 95 })
  durationSeconds: number;

  @ApiProperty({
    type: String,
    nullable: true,
    format: 'uuid',
    description: 'Épisode suivant à précharger (M-12)',
  })
  nextEpisodeId: string | null;
}

export class UpdateProgressDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  episodeId: string;

  @ApiProperty({ minimum: 0, maximum: 86400, example: 42 })
  @IsInt()
  @Min(0)
  @Max(86_400)
  positionSeconds: number;

  @ApiPropertyOptional({ default: false, description: 'Épisode regardé jusqu’au bout' })
  @IsOptional()
  @IsBoolean()
  completed?: boolean;
}

export class WatchProgressDto {
  @ApiProperty({ format: 'uuid' })
  episodeId: string;

  @ApiProperty()
  positionSeconds: number;

  @ApiProperty()
  completed: boolean;

  @ApiProperty({ format: 'date-time' })
  updatedAt: string;
}
