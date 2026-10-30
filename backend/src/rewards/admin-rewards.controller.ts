import { Body, Controller, Get, Ip, Param, Patch, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AdminAuthGuard } from '../admin/auth/admin-auth.guard.js';
import { AdminRoute } from '../common/decorators/admin-route.decorator.js';
import { CurrentAdmin } from '../common/decorators/current-admin.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { ApiErrorDto } from '../common/dto/api-error.dto.js';
import { type AuthenticatedAdmin } from '../common/request-context.js';
import { AdminRewardTaskDto, UpdateRewardTaskDto } from './dto/rewards.dto.js';
import { RewardsService } from './rewards.service.js';

/** Tâches récompensées en back-office (B-08, contrat v1.5). Rôles MONETIZATION et ADMIN. */
@ApiTags('admin-monetization')
@ApiBearerAuth('admin')
@ApiUnauthorizedResponse({
  type: ApiErrorDto,
  description: 'UNAUTHENTICATED | INVALID_ADMIN_TOKEN',
})
@ApiForbiddenResponse({ type: ApiErrorDto, description: 'FORBIDDEN_ROLE' })
@AdminRoute()
@UseGuards(AdminAuthGuard)
@Roles('MONETIZATION', 'ADMIN')
@Controller('admin/rewards/tasks')
export class AdminRewardsController {
  constructor(private readonly rewards: RewardsService) {}

  @Get()
  @ApiOperation({ summary: 'Tâches récompensées (clés fixes du MVP, montants et cibles)' })
  @ApiOkResponse({ type: [AdminRewardTaskDto] })
  list(): Promise<AdminRewardTaskDto[]> {
    return this.rewards.adminListTasks();
  }

  @Patch(':key')
  @ApiOperation({
    summary: 'Modifier une tâche (pièces, cible, activation) ; audit `reward_task.update`',
  })
  @ApiParam({ name: 'key', example: 'watch_3_episodes' })
  @ApiOkResponse({ type: AdminRewardTaskDto })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'TASK_NOT_FOUND' })
  update(
    @Param('key') key: string,
    @Body() dto: UpdateRewardTaskDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Ip() ip: string,
  ): Promise<AdminRewardTaskDto> {
    return this.rewards.adminUpdateTask(key, dto, admin, ip);
  }
}
