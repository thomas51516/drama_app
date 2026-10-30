import { Module } from '@nestjs/common';
import { WalletController } from './wallet.controller.js';
import { WalletService } from './wallet.service.js';

/** Portefeuille (S07-BE-01/04) : `WalletService` est le seul point d'écriture de `coin_ledger`. */
@Module({ controllers: [WalletController], providers: [WalletService], exports: [WalletService] })
export class WalletModule {}
