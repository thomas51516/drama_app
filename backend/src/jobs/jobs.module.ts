import { Module } from '@nestjs/common';
import { AdminCampaignsModule } from '../admin/campaigns/admin-campaigns.module.js';
import { UsersModule } from '../users/users.module.js';
import { PublishSchedulerService } from './publish-scheduler.service.js';
import { SchedulerService } from './scheduler.service.js';

/** Tâches planifiées : publications programmées (B-04), anonymisation des comptes (S05-BE-04), campagnes programmées (B-10). */
@Module({
  imports: [UsersModule, AdminCampaignsModule],
  providers: [PublishSchedulerService, SchedulerService],
  exports: [PublishSchedulerService],
})
export class JobsModule {}
