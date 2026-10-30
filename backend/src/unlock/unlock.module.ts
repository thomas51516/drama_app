import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module.js';
import { WalletModule } from '../wallet/wallet.module.js';
import { UnlockController } from './unlock.controller.js';
import { UnlockService } from './unlock.service.js';

@Module({
  imports: [CatalogModule, WalletModule],
  controllers: [UnlockController],
  providers: [UnlockService],
  exports: [UnlockService],
})
export class UnlockModule {}
