import { Controller, Get, Param, Post } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { type AuthenticatedUser } from '../common/request-context.js';
import { RewardsService } from './rewards.service.js';

@ApiExcludeController()
@Controller('rewards')
export class RewardsController {
  constructor(private readonly rewards: RewardsService) {}

  // TODO S08-BE-04
  @Post('checkin')
  checkIn(@CurrentUser() user: AuthenticatedUser): never {
    return this.rewards.checkIn(user.id);
  }

  @Get('tasks')
  tasks(@CurrentUser() user: AuthenticatedUser): never {
    return this.rewards.listTasks(user.id);
  }

  @Post('tasks/:id/claim')
  claim(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): never {
    return this.rewards.claimTask(user.id, id);
  }
}
