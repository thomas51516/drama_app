import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { RewardTaskPeriod } from '../../generated/prisma/client.js';
import { WalletDto } from '../../wallet/dto/wallet.dto.js';

/** Corps des réclamations (contrat v1.5) : clé d'idempotence générée par l'app. */
export class ClaimDto {
  @ApiProperty({ example: '6f1d2c3b-4a5e-4f60-8b7c-9d0e1f2a3b4c' })
  @IsString()
  @Length(8, 128)
  idempotencyKey: string;
}

/** `GET /rewards/checkin` */
export class CheckinStatusDto {
  @ApiProperty({
    type: [Number],
    example: [5, 5, 10, 10, 15, 20, 30],
    description: 'Barème sur 7 jours',
  })
  scale: number[];

  @ApiProperty({
    example: 3,
    minimum: 0,
    maximum: 7,
    description: 'Jour du cycle atteint par la série en cours (0 = aucune série en cours)',
  })
  streakDay: number;

  @ApiProperty({ description: 'Check-in déjà effectué aujourd’hui (fuseau du pays du compte)' })
  claimedToday: boolean;

  @ApiProperty({
    format: 'date-time',
    description: 'Prochain check-in possible : maintenant si non réclamé, sinon minuit local',
  })
  nextClaimAt: string;

  @ApiProperty({ description: 'Un jour manqué remet le cycle au jour 1' })
  resetOnMiss: boolean;
}

/** `POST /rewards/checkin` */
export class CheckinClaimResultDto {
  @ApiProperty({ example: 3, description: 'Jour du cycle crédité (1 à 7)' })
  day: number;

  @ApiProperty({ example: 10, description: 'Pièces bonus créditées' })
  coins: number;

  @ApiProperty({ type: WalletDto })
  wallet: WalletDto;
}

export const REWARD_TASK_STATUSES = ['AVAILABLE', 'CLAIMABLE', 'CLAIMED', 'LOCKED'] as const;
export type RewardTaskStatus = (typeof REWARD_TASK_STATUSES)[number];

export const REWARD_TASK_KEYS = [
  'watch_3_episodes',
  'watch_10_episodes',
  'enable_notifications',
  'share_series',
  'complete_profile',
  'add_favorite',
] as const;
export type RewardTaskKey = (typeof REWARD_TASK_KEYS)[number];

export class RewardTaskDto {
  @ApiProperty({
    example: 'watch_3_episodes',
    description: 'Identifiant à passer à `/claim` (= clé)',
  })
  id: string;

  @ApiProperty({ enum: REWARD_TASK_KEYS })
  key: string;

  @ApiProperty({ example: 'Regarder 3 épisodes aujourd’hui' })
  title: string;

  @ApiProperty({ example: 'Terminez 3 épisodes dans la journée.' })
  description: string;

  @ApiProperty({ example: 5 })
  coins: number;

  @ApiProperty({ example: 3 })
  target: number;

  @ApiProperty({ example: 1, description: 'Progression calculée côté serveur, bornée à `target`' })
  progress: number;

  @ApiProperty({ enum: REWARD_TASK_STATUSES })
  status: RewardTaskStatus;

  @ApiProperty({
    type: String,
    nullable: true,
    format: 'date-time',
    description:
      'Fin de la période (jour ou semaine civile dans le fuseau du pays) ; null pour une tâche unique',
  })
  expiresAt: string | null;
}

export class RewardTasksDto {
  @ApiProperty({ type: [RewardTaskDto] })
  tasks: RewardTaskDto[];
}

export class ClaimTaskResultDto {
  @ApiProperty({ example: 5, description: 'Pièces bonus créditées' })
  coins: number;

  @ApiProperty({ type: WalletDto })
  wallet: WalletDto;
}

// ----------------------------------------------------------------------------- admin (B-08)

export class AdminRewardTaskDto {
  @ApiProperty({ enum: REWARD_TASK_KEYS })
  key: string;

  @ApiProperty({ example: 'Regarder 3 épisodes aujourd’hui', description: 'Libellé français' })
  title: string;

  @ApiProperty({ example: 5 })
  coins: number;

  @ApiProperty({ example: 3 })
  target: number;

  @ApiProperty({ enum: Object.values(RewardTaskPeriod) })
  period: RewardTaskPeriod;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty({ example: 1 })
  position: number;

  @ApiProperty({ format: 'date-time' })
  updatedAt: string;
}

export class UpdateRewardTaskDto {
  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  coins?: number;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  target?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
