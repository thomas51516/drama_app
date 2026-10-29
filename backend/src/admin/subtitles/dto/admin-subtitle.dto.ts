import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Matches } from 'class-validator';

/** Taille maximale d'un fichier de sous-titres : 2 Mo (contrat admin v1.1). */
export const MAX_SUBTITLE_BYTES = 2 * 1024 * 1024;

export class AdminSubtitleDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  episodeId: string;

  @ApiProperty({ example: 'fr', description: 'Code ISO 639-1 (fr, en, es, pt, …)' })
  language: string;

  @ApiProperty({ example: 'Français', description: 'Nom de la langue, dans cette langue' })
  label: string;

  @ApiProperty({
    description: 'URL publique du fichier WebVTT (`subtitles/{episodeId}/{language}.vtt`)',
    example: 'http://localhost:9000/drama-media/subtitles/0192f1f0-…/fr.vtt',
  })
  fileUrl: string;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;
}

/** Champs texte du formulaire multipart (`file` est le fichier .srt ou .vtt). */
export class UploadSubtitleDto {
  @ApiProperty({
    example: 'fr',
    description: 'Code ISO 639-1, éventuellement régionalisé (`pt-BR`)',
    pattern: '^[a-z]{2,3}(-[A-Z]{2})?$',
  })
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeLanguageTag(value) : value,
  )
  @Matches(/^[a-z]{2,3}(-[A-Z]{2})?$/, { message: 'language must be an ISO 639-1 code' })
  language: string;
}

/** `FR`, `pt-br` → `fr`, `pt-BR`. */
export function normalizeLanguageTag(value: string): string {
  const [base = '', region] = value.trim().replace('_', '-').split('-');
  return region ? `${base.toLowerCase()}-${region.toUpperCase()}` : base.toLowerCase();
}
