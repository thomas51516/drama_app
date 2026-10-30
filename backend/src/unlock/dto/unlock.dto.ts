import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';
import { WalletDto } from '../../wallet/dto/wallet.dto.js';

export const UNLOCK_METHODS = ['coins', 'ad', 'vip', 'free'] as const;
export type UnlockMethodLabel = (typeof UNLOCK_METHODS)[number];

/** `POST /episodes/{id}/unlock` (contrat v1.4). */
export class UnlockEpisodeDto {
  @ApiProperty({
    description:
      'Clé d’idempotence générée par l’app (UUID) : un double appel ne débite qu’une fois (§8.4).',
    example: '6f1d2c3b-4a5e-4f60-8b7c-9d0e1f2a3b4c',
  })
  @IsString()
  @Length(8, 128)
  idempotencyKey: string;
}

export class ChargedDto {
  @ApiProperty({ example: 4, description: 'Pièces bonus débitées' })
  bonus: number;

  @ApiProperty({ example: 6, description: 'Pièces achetées débitées' })
  purchased: number;
}

export class UnlockResultDto {
  @ApiProperty({ format: 'uuid' })
  episodeId: string;

  @ApiProperty({
    enum: UNLOCK_METHODS,
    description:
      '`coins` (débit), `free` (épisode gratuit), `vip` (abonné), `ad` ; méthode d’origine si déjà débloqué',
  })
  method: UnlockMethodLabel;

  @ApiProperty({ type: ChargedDto, description: '`{ 0, 0 }` si déjà débloqué, gratuit ou VIP' })
  charged: ChargedDto;

  @ApiProperty({ type: WalletDto })
  wallet: WalletDto;
}

export class SeriesUnlocksDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    description: 'Épisodes de la série débloqués par le compte',
  })
  unlockedEpisodeIds: string[];
}

/** `GET /series/{id}/unlock-all/quote` (contrat v1.5, M-23). */
export class UnlockAllQuoteDto {
  @ApiProperty({ example: 7, description: 'Épisodes visibles encore verrouillés pour le compte' })
  lockedCount: number;

  @ApiProperty({ example: 70, description: 'Somme des coûts unitaires' })
  fullPrice: number;

  @ApiProperty({ example: 15, description: '`seriesUnlockDiscountPercent` des paramètres' })
  discountPercent: number;

  @ApiProperty({ example: 60, description: 'Prix remisé, arrondi au supérieur' })
  price: number;
}

export class UnlockAllResultDto {
  @ApiProperty({ type: [String], format: 'uuid', description: 'Épisodes débloqués par cet appel' })
  unlockedEpisodeIds: string[];

  @ApiProperty({ type: ChargedDto })
  charged: ChargedDto;

  @ApiProperty({ type: WalletDto })
  wallet: WalletDto;
}
