import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';

export const CLIENT_PLATFORMS = ['android', 'web', 'other'] as const;
export type ClientPlatform = (typeof CLIENT_PLATFORMS)[number];

export class GuestAuthDto {
  @ApiProperty({
    description:
      "Identifiant d'installation généré par l'app (UUID recommandé). Conservé pour le diagnostic et le rattachement futur du compte invité (M-50).",
    example: '3f2c1a9e-5b7d-4c8e-9f0a-1b2c3d4e5f60',
    minLength: 8,
    maxLength: 128,
  })
  @IsString()
  @Length(8, 128)
  deviceId: string;

  @ApiPropertyOptional({ enum: CLIENT_PLATFORMS, default: 'android' })
  @IsOptional()
  @IsIn(CLIENT_PLATFORMS)
  platform?: ClientPlatform;

  @ApiPropertyOptional({
    description: "Langue de l'interface (BCP 47 court).",
    example: 'fr',
    default: 'fr',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/, {
    message: 'language must be a BCP 47 tag (fr, en, pt-BR)',
  })
  language?: string;

  @ApiPropertyOptional({ description: 'Pays ISO 3166-1 alpha-2.', example: 'TG' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{2}$/, { message: 'country must be an ISO 3166-1 alpha-2 code' })
  country?: string;
}
