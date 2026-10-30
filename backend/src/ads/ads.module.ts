import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module.js';
import { AppConfig } from '../config/app-config.js';
import { UnlockModule } from '../unlock/unlock.module.js';
import { AdsController } from './ads.controller.js';
import { AdsService } from './ads.service.js';
import { AD_SSV_VERIFIER, type AdSsvVerifier } from './ssv/ad-ssv-verifier.js';
import { AdmobAdSsvVerifier } from './ssv/admob-ad-ssv.verifier.js';
import { FakeAdSsvVerifier } from './ssv/fake-ad-ssv.verifier.js';

/** Pub récompensée (M-22, S08-BE-03) : sessions, éligibilité, callback SSV `admob` | `fake`. */
@Module({
  imports: [CatalogModule, UnlockModule],
  controllers: [AdsController],
  providers: [
    {
      provide: AD_SSV_VERIFIER,
      inject: [AppConfig],
      useFactory: (config: AppConfig): AdSsvVerifier => {
        if (config.ads.provider === 'admob') return new AdmobAdSsvVerifier(config.ads.admobKeysUrl);
        if (config.isProduction) throw new Error('AD_PROVIDER=fake is not allowed in production');
        return new FakeAdSsvVerifier(config.ads.fakeSecret);
      },
    },
    AdsService,
  ],
  exports: [AdsService],
})
export class AdsModule {}
