import { Module } from '@nestjs/common';
import { AuditModule } from '../admin/audit/audit.module.js';
import { AdminAuthModule } from '../admin/auth/admin-auth.module.js';
import { WalletModule } from '../wallet/wallet.module.js';
import { AdminOffersController } from './admin-offers.controller.js';
import { OffersController } from './offers.controller.js';
import { OffersService } from './offers.service.js';

/** Offres (M-24, B-07, S10-BE-03) : bienvenue, offres limitées, codes promo. */
@Module({
  imports: [WalletModule, AuditModule, AdminAuthModule],
  controllers: [OffersController, AdminOffersController],
  providers: [OffersService],
  exports: [OffersService],
})
export class OffersModule {}
