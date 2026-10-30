import { Module } from '@nestjs/common';
import { BillingModule } from '../../billing/billing.module.js';
import { WalletModule } from '../../wallet/wallet.module.js';
import { AdminAuthModule } from '../auth/admin-auth.module.js';
import { AdminUsersController } from './admin-users.controller.js';
import { AdminUsersService } from './admin-users.service.js';

@Module({
  imports: [AdminAuthModule, WalletModule, BillingModule],
  controllers: [AdminUsersController],
  providers: [AdminUsersService],
})
export class AdminUsersModule {}
