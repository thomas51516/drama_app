import { Global, Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin/auth/admin-auth.module.js';
import { AuditModule } from '../admin/audit/audit.module.js';
import { AdminMonetizationController } from './admin-monetization.controller.js';
import { AdminMonetizationService } from './admin-monetization.service.js';
import { MonetizationSettingsService } from './monetization-settings.service.js';
import { ShopController } from './shop.controller.js';
import { ShopService } from './shop.service.js';

/**
 * Monétisation (B-06, B-08, S07-BE-05) : paramètres, packs, formules VIP, boutique publique.
 * Global : les paramètres sont lus par le portefeuille, le déblocage, l'auth et les séries admin.
 */
@Global()
@Module({
  imports: [AuditModule, AdminAuthModule],
  controllers: [ShopController, AdminMonetizationController],
  providers: [MonetizationSettingsService, ShopService, AdminMonetizationService],
  exports: [MonetizationSettingsService, ShopService],
})
export class MonetizationModule {}
