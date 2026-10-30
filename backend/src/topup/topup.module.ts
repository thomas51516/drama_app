import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin/auth/admin-auth.module.js';
import { AppConfig } from '../config/app-config.js';
import { OffersModule } from '../offers/offers.module.js';
import { WalletModule } from '../wallet/wallet.module.js';
import { AdminTopupController } from './admin-topup.controller.js';
import { CinetPayMobileMoneyProvider } from './provider/cinetpay-mobile-money.provider.js';
import { FakeMobileMoneyProvider } from './provider/fake-mobile-money.provider.js';
import {
  MOBILE_MONEY_PROVIDER,
  type MobileMoneyProvider,
} from './provider/mobile-money-provider.js';
import { TopupReconciliationService } from './reconciliation.service.js';
import { TopupController } from './topup.controller.js';
import { TopupService } from './topup.service.js';

/** Recharge mobile money (M-34, S09-BE-01/02) : commandes, webhooks `fake` | `cinetpay`, réconciliation. */
@Module({
  imports: [WalletModule, OffersModule, AdminAuthModule],
  controllers: [TopupController, AdminTopupController],
  providers: [
    {
      provide: MOBILE_MONEY_PROVIDER,
      inject: [AppConfig],
      useFactory: (config: AppConfig): MobileMoneyProvider => {
        const t = config.topup;
        if (t.provider === 'cinetpay') {
          return new CinetPayMobileMoneyProvider({
            apiKey: t.cinetpayApiKey!,
            siteId: t.cinetpaySiteId!,
            secret: t.cinetpaySecret!,
            baseUrl: t.cinetpayBaseUrl,
            notifyUrl: `${t.publicBaseUrl}/webhooks/mobile-money/cinetpay`,
            returnUrl: t.returnUrl ?? null,
          });
        }
        if (config.isProduction)
          throw new Error('MOBILE_MONEY_PROVIDER=fake is not allowed in production');
        return new FakeMobileMoneyProvider(t.fakeSecret, t.publicBaseUrl);
      },
    },
    TopupService,
    TopupReconciliationService,
  ],
  exports: [TopupService, TopupReconciliationService],
})
export class TopupModule {}
