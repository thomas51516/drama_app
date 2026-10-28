import { Module, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { AdminModule } from './admin/admin.module.js';
import { AuthModule } from './auth/auth.module.js';
import { BillingModule } from './billing/billing.module.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { ConfigModule } from './config/config.module.js';
import { HealthModule } from './health/health.module.js';
import { PlaybackModule } from './playback/playback.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { RedisModule } from './redis/redis.module.js';
import { RewardsModule } from './rewards/rewards.module.js';
import { UnlockModule } from './unlock/unlock.module.js';
import { UsersModule } from './users/users.module.js';
import { WalletModule } from './wallet/wallet.module.js';

/** Monolithe modulaire (§8) : un module par domaine métier du cahier des charges §8.2. */
@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    RedisModule,
    HealthModule,
    AuthModule,
    CatalogModule,
    PlaybackModule,
    UnlockModule,
    WalletModule,
    BillingModule,
    RewardsModule,
    UsersModule,
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
