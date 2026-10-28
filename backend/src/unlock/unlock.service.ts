import { Injectable } from '@nestjs/common';
import { notImplemented } from '../common/errors/not-implemented.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Déblocage (§8.2, §8.4). Règles : transaction atomique débit + unlock, clé d'idempotence,
 * pièces bonus consommées avant les achetées, `unlocks` unique (utilisateur, épisode).
 */
@Injectable()
export class UnlockService {
  constructor(private readonly prisma: PrismaService) {}

  // TODO S07-BE-02 / S07-BE-03 : POST /episodes/{id}/unlock
  unlockWithCoins(_userId: string, _episodeId: string, _idempotencyKey: string): never {
    return notImplemented('S07-BE-02');
  }

  // TODO S08-BE-03 : callback SSV AdMob signé, plafond quotidien Redis
  rewardFromAd(_payload: unknown): never {
    return notImplemented('S08-BE-03');
  }
}
