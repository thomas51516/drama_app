import { Module } from '@nestjs/common';
import { AdminCampaignsModule } from '../admin/campaigns/admin-campaigns.module.js';
import { UsersModule } from '../users/users.module.js';
import { WalletModule } from '../wallet/wallet.module.js';
import { PublishSchedulerService } from './publish-scheduler.service.js';
import { SchedulerService } from './scheduler.service.js';

/** Tâches planifiées : publications programmées (B-04), anonymisation des comptes (S05-BE-04), campagnes programmées (B-10), expiration des pièces bonus (§8.4). */
@Module({
  imports: [UsersModule, AdminCampaignsModule, WalletModule],
  providers: [PublishSchedulerService, SchedulerService],
  exports: [PublishSchedulerService],
})
export class JobsModule {}
