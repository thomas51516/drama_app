import { Injectable } from '@nestjs/common';
import { notImplemented } from '../common/errors/not-implemented.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Récompenses (§4.5) : check-in quotidien, tâches. Crédits = lignes BONUS du grand livre avec expiration. */
@Injectable()
export class RewardsService {
  constructor(private readonly prisma: PrismaService) {}

  // TODO S08-BE-04 : barème sur 7 jours, idempotence journalière
  checkIn(_userId: string): never {
    return notImplemented('S08-BE-04');
  }

  // TODO P2 (M-41) : tâches
  listTasks(_userId: string): never {
    return notImplemented('M-41 (P2)');
  }

  claimTask(_userId: string, _taskId: string): never {
    return notImplemented('M-41 (P2)');
  }
}
