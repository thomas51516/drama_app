import { Module, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { AdminModule } from './admin/admin.module.js';
import { AuthModule } from './auth/auth.module.js';
import { BillingModule } from './billing/billing.module.js';
import { CatalogCacheModule } from './cache/catalog-cache.module.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { RateLimitModule } from './common/rate-limit/rate-limit.module.js';
import { ConfigModule } from './config/config.module.js';
import { HealthModule } from './health/health.module.js';
import { MetricsModule } from './metrics/metrics.module.js';
import { PlaybackModule } from './playback/playback.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { RedisModule } from './redis/redis.module.js';
import { RewardsModule } from './rewards/rewards.module.js';
import { StorageModule } from './storage/storage.module.js';
import { TranscodeModule } from './transcode/transcode.module.js';
import { UnlockModule } from './unlock/unlock.module.js';
import { UsersModule } from './users/users.module.js';
import { WalletModule } from './wallet/wallet.module.js';

/** Monolithe modulaire (§8) : un module par domaine métier du cahier des charges §8.2. */
@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    RedisModule,
    CatalogCacheModule,
    MetricsModule,
    StorageModule,
    RateLimitModule,
    HealthModule,
    AuthModule,
    CatalogModule,
    PlaybackModule,
    UnlockModule,
    WalletModule,
    BillingModule,
    RewardsModule,
    UsersModule,
    TranscodeModule,
    AdminModule,
  ],
  providers: [
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: false },
      }),
    },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
