import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../auth/admin-auth.module.js';
import { AdminCampaignsController } from './admin-campaigns.controller.js';
import { AdminCampaignsService } from './admin-campaigns.service.js';

/** Campagnes push ciblées (B-10). */
@Module({
  imports: [AdminAuthModule],
  controllers: [AdminCampaignsController],
  providers: [AdminCampaignsService],
  exports: [AdminCampaignsService],
})
export class AdminCampaignsModule {}
