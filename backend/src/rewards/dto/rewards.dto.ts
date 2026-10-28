import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WalletDto } from '../../wallet/dto/wallet.dto.js';

/** Planifié S08-BE-04. */
export class CheckInResultDto {
  @ApiProperty({ example: 3, description: 'Jour du cycle (1 à 7)' })
  day: number;

  @ApiProperty({ example: 5 })
  coinsCredited: number;

  @ApiProperty({ example: 3, description: 'Jours consécutifs' })
  streak: number;

  @ApiProperty({ description: 'Déjà effectué aujourd’hui (aucun crédit)' })
  alreadyCheckedIn: boolean;

  @ApiProperty({ format: 'date-time' })
  nextCheckInAt: string;

  @ApiProperty({ type: WalletDto })
  wallet: WalletDto;
}

export const REWARD_TASK_STATUSES = ['available', 'claimable', 'claimed'] as const;

/** Planifié M-41 (P2). */
export class RewardTaskDto {
  @ApiProperty({ example: 'watch_3_episodes' })
  id: string;

  @ApiProperty({ example: 'Regarder 3 épisodes' })
  title: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiProperty({ example: 10 })
  coins: number;

  @ApiProperty({ enum: REWARD_TASK_STATUSES })
  status: (typeof REWARD_TASK_STATUSES)[number];

  @ApiPropertyOptional({ example: 1 })
  progress?: number;

  @ApiPropertyOptional({ example: 3 })
  target?: number;
}

export class RewardTasksDto {
  @ApiProperty({ type: [RewardTaskDto] })
  items: RewardTaskDto[];
}

export class ClaimTaskResultDto {
  @ApiProperty()
  taskId: string;

  @ApiProperty({ example: 10 })
  coinsCredited: number;

  @ApiProperty({ type: WalletDto })
  wallet: WalletDto;
}
