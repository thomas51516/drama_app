import { Module } from '@nestjs/common';
import { AppConfig } from '../config/app-config.js';
import { WalletModule } from '../wallet/wallet.module.js';
import { BillingController } from './billing.controller.js';
import { BillingService } from './billing.service.js';
import { FakePurchaseVerifier } from './verifier/fake-purchase.verifier.js';
import { GooglePurchaseVerifier } from './verifier/google-purchase.verifier.js';
import { PURCHASE_VERIFIER, type PurchaseVerifier } from './verifier/purchase-verifier.js';

@Module({
  imports: [WalletModule],
  controllers: [BillingController],
  providers: [
    {
      provide: PURCHASE_VERIFIER,
      inject: [AppConfig],
      useFactory: (config: AppConfig): PurchaseVerifier => {
        if (config.billing.verifier === 'google') return new GooglePurchaseVerifier(config);
        if (config.isProduction)
          throw new Error('BILLING_VERIFIER=fake is not allowed in production');
        return new FakePurchaseVerifier();
      },
    },
    BillingService,
  ],
  exports: [BillingService],
})
export class BillingModule {}
