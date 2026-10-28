import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Length, Min } from 'class-validator';
import { UnlockMethod } from '../../generated/prisma/client.js';
import { WalletDto } from '../../wallet/dto/wallet.dto.js';

/** Planifié S07-BE-02. */
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

export class UnlockResultDto {
  @ApiProperty({ format: 'uuid' })
  episodeId: string;

  @ApiProperty({ enum: Object.values(UnlockMethod) })
  method: UnlockMethod;

  @ApiProperty({ example: 10, description: 'Pièces débitées (0 si déjà débloqué)' })
  coinsDebited: number;

  @ApiProperty({ description: 'Appel déjà traité avec la même clé d’idempotence' })
  alreadyUnlocked: boolean;

  @ApiProperty({ type: WalletDto })
  wallet: WalletDto;
}

/** Callback SSV de la régie (AdMob) — planifié S08-BE-03. Les champs exacts suivent la régie retenue (S02-PM-01). */
export class AdRewardCallbackDto {
  @ApiProperty({ example: 'admob' })
  @IsString()
  provider: string;

  @ApiProperty({ description: 'Identifiant unique de la transaction côté régie (idempotence)' })
  @IsString()
  transactionId: string;

  @ApiProperty({ format: 'uuid', description: 'Utilisateur DRAMA (user_id SSV)' })
  @IsString()
  userId: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(0)
  rewardAmount: number;

  @ApiPropertyOptional({ description: 'Données personnalisées (episodeId visé)' })
  @IsOptional()
  @IsString()
  customData?: string;

  @ApiProperty({ description: 'Signature de la régie, vérifiée côté serveur' })
  @IsString()
  signature: string;

  @ApiProperty({ example: '1730112000000' })
  @IsString()
  timestamp: string;

  @ApiPropertyOptional({ description: 'Identifiant de la clé de signature' })
  @IsOptional()
  @IsString()
  keyId?: string;
}

export class AdRewardAckDto {
  @ApiProperty()
  accepted: boolean;

  @ApiProperty({
    type: String,
    nullable: true,
    format: 'uuid',
    description: 'Épisode débloqué par la pub',
  })
  episodeId: string | null;
}
