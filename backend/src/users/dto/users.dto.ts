import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Length, Matches } from 'class-validator';
import { AuthUserDto } from '../../auth/dto/auth-response.dto.js';
import { SeriesSummaryDto } from '../../catalog/dto/catalog.dto.js';

/** Planifié S05-BE-04. */
export class MeDto extends AuthUserDto {
  @ApiProperty({ type: String, nullable: true })
  email: string | null;

  @ApiProperty({ type: String, nullable: true, example: '+22890000000' })
  phone: string | null;

  @ApiProperty({ type: String, nullable: true })
  displayName: string | null;

  @ApiProperty({ description: 'Déblocage automatique de l’épisode suivant si le solde le permet' })
  autoUnlock: boolean;

  @ApiProperty({
    type: String,
    nullable: true,
    format: 'date-time',
    description: 'Suppression programmée (DELETION_PENDING)',
  })
  deletionScheduledAt: string | null;
}

export class UpdateMeDto {
  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @IsString()
  @Length(1, 80)
  displayName?: string;

  @ApiPropertyOptional({ example: 'fr' })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/)
  language?: string;

  @ApiPropertyOptional({ example: 'TG' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{2}$/)
  country?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  autoUnlock?: boolean;
}

export class DeleteMeResultDto {
  @ApiProperty({ enum: ['DELETION_PENDING'] })
  status: 'DELETION_PENDING';

  @ApiProperty({
    format: 'date-time',
    description: 'Purge définitive après le délai de rétractation',
  })
  purgeAt: string;
}

/** Planifié S05-BE-05. */
export class FavoriteDto {
  @ApiProperty({ type: SeriesSummaryDto })
  series: SeriesSummaryDto;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;
}

export class FavoritesDto {
  @ApiProperty({ type: [FavoriteDto] })
  items: FavoriteDto[];
}
