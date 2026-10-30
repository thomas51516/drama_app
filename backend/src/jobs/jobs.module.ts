import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module.js';
import { PublishSchedulerService } from './publish-scheduler.service.js';
import { SchedulerService } from './scheduler.service.js';

/** Tâches planifiées : publications programmées (B-04) et anonymisation des comptes (S05-BE-04). */
@Module({
  imports: [UsersModule],
  providers: [PublishSchedulerService, SchedulerService],
  exports: [PublishSchedulerService],
})
export class JobsModule {}
