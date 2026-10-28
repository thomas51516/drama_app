import { Injectable } from '@nestjs/common';
import { notImplemented } from '../common/errors/not-implemented.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Back-office (§5, §8.2) : endpoints /admin/* réservés aux comptes internes, contrôlés par rôle
 * (EDITOR, MONETIZATION, SUPPORT, ADMIN) et tracés dans `audit_logs`.
 */
@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  // TODO S03-BE-04 : connexion des comptes internes, garde de rôle, journal d'audit
  login(_email: string, _password: string): never {
    return notImplemented('S03-BE-04');
  }

  // TODO S03-BE-01 / S03-BE-02 / S03-BE-03 : CRUD séries, épisodes, sous-titres
  listSeries(): never {
    return notImplemented('S03-BE-01');
  }
}
