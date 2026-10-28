import { Injectable } from '@nestjs/common';
import { notImplemented } from '../common/errors/not-implemented.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Utilisateur (§8.2) : profil, suppression différée, favoris. */
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  // TODO S05-BE-04 : GET/PATCH/DELETE /me
  getMe(_userId: string): never {
    return notImplemented('S05-BE-04');
  }

  updateMe(_userId: string, _patch: unknown): never {
    return notImplemented('S05-BE-04');
  }

  deleteMe(_userId: string): never {
    return notImplemented('S05-BE-04');
  }

  // TODO S05-BE-05 : favoris « Ma liste »
  listFavorites(_userId: string): never {
    return notImplemented('S05-BE-05');
  }

  addFavorite(_userId: string, _seriesId: string): never {
    return notImplemented('S05-BE-05');
  }

  removeFavorite(_userId: string, _seriesId: string): never {
    return notImplemented('S05-BE-05');
  }
}
