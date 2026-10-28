import { Injectable } from '@nestjs/common';
import { notImplemented } from '../common/errors/not-implemented.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Portefeuille (§8.2). Le solde est une projection de `coin_ledger` (voir schema.prisma) :
 * ce service sera le SEUL point d'écriture du grand livre (crédit, débit, expiration).
 */
@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  // TODO S07-BE-01 / S07-BE-04 : GET /wallet (soldes achetés / bonus)
  getWallet(_userId: string): never {
    return notImplemented('S07-BE-04');
  }

  // TODO S07-BE-04 : GET /wallet/transactions (paginé)
  listTransactions(_userId: string): never {
    return notImplemented('S07-BE-04');
  }
}
