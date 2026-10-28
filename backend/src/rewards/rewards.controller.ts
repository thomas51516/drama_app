import { Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiNotImplementedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { ApiErrorDto } from '../common/dto/api-error.dto.js';
import { type AuthenticatedUser } from '../common/request-context.js';
import { CheckInResultDto, ClaimTaskResultDto, RewardTasksDto } from './dto/rewards.dto.js';
import { RewardsService } from './rewards.service.js';

/** Récompenses (§4.5). Planifié S08-BE-04 (check-in) et M-41 (tâches, P2). */
@ApiTags('rewards')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'UNAUTHENTICATED | INVALID_TOKEN' })
@ApiNotImplementedResponse({ type: ApiErrorDto, description: 'NOT_IMPLEMENTED' })
@Controller('rewards')
export class RewardsController {
  constructor(private readonly rewards: RewardsService) {}

  // TODO S08-BE-04
  @Post('checkin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Check-in quotidien (planifié S08-BE-04)',
    description: 'Barème sur 7 jours, crédit en pièces bonus expirables, idempotent par jour.',
  })
  @ApiOkResponse({ type: CheckInResultDto })
  checkIn(@CurrentUser() user: AuthenticatedUser): never {
    return this.rewards.checkIn(user.id);
  }

  @Get('tasks')
  @ApiOperation({ summary: 'Tâches récompensées (planifié M-41, P2)' })
  @ApiOkResponse({ type: RewardTasksDto })
  tasks(@CurrentUser() user: AuthenticatedUser): never {
    return this.rewards.listTasks(user.id);
  }

  @Post('tasks/:id/claim')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Réclamer la récompense d’une tâche (planifié M-41, P2)' })
  @ApiParam({ name: 'id', example: 'watch_3_episodes' })
  @ApiOkResponse({ type: ClaimTaskResultDto })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'TASK_NOT_FOUND' })
  @ApiConflictResponse({
    type: ApiErrorDto,
    description: 'TASK_NOT_CLAIMABLE | TASK_ALREADY_CLAIMED',
  })
  claim(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): never {
    return this.rewards.claimTask(user.id, id);
  }
}
