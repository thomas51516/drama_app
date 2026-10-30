import { Module } from '@nestjs/common';
import { AuditModule } from '../admin/audit/audit.module.js';
import { AdminAuthModule } from '../admin/auth/admin-auth.module.js';
import { WalletModule } from '../wallet/wallet.module.js';
import { AdminRewardsController } from './admin-rewards.controller.js';
import { RewardsController } from './rewards.controller.js';
import { RewardsService } from './rewards.service.js';

/** Récompenses (§4.5) : check-in quotidien (M-40), tâches (M-41), administration (B-08). */
@Module({
  imports: [WalletModule, AuditModule, AdminAuthModule],
  controllers: [RewardsController, AdminRewardsController],
  providers: [RewardsService],
  exports: [RewardsService],
})
export class RewardsModule {}
