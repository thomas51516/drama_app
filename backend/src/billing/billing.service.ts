import { Injectable } from '@nestjs/common';
import { notImplemented } from '../common/errors/not-implemented.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Paiements (§10) : Google Play Billing (vérification serveur + acquittement), RTDN, mobile money. */
@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  // TODO S07-BE-06 : vérification Developer API, crédit via le grand livre, acquittement
  verifyGooglePurchase(_userId: string, _payload: unknown): never {
    return notImplemented('S07-BE-06');
  }

  // TODO S07-BE-07 : réception RTDN (Pub/Sub), signature, file BullMQ
  handleGoogleRtdn(_payload: unknown): never {
    return notImplemented('S07-BE-07');
  }

  // TODO S09-BE-01 : webhook agrégateur (CinetPay / FedaPay / PayDunya), signature, idempotence
  handleMobileMoneyWebhook(_provider: string, _payload: unknown): never {
    return notImplemented('S09-BE-01');
  }
}
