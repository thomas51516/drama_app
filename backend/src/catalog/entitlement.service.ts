import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { type EpisodeAccess } from './dto/catalog.dto.js';

export interface Entitlements {
  isVip: boolean;
  /** Identifiants d'épisodes déjà débloqués (pièces, pub, gratuit...). */
  unlocked: ReadonlySet<string>;
  country: string | null;
}

export const NO_ENTITLEMENTS: Entitlements = { isVip: false, unlocked: new Set(), country: null };

/**
 * Droits d'accès d'un spectateur (le serveur fait foi, §8.4).
 * Réutilisé par le catalogue (statut par épisode, M-10) et la lecture (/play).
 */
@Injectable()
export class EntitlementService {
  constructor(private readonly prisma: PrismaService) {}

  async forViewer(userId: string | undefined, episodeIds?: string[]): Promise<Entitlements> {
    if (!userId) return NO_ENTITLEMENTS;
    const [user, unlocks] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { isVip: true, vipExpiresAt: true, country: true },
      }),
      this.prisma.unlock.findMany({
        where: { userId, ...(episodeIds ? { episodeId: { in: episodeIds } } : {}) },
        select: { episodeId: true },
      }),
    ]);
    if (!user) return NO_ENTITLEMENTS;
    return {
      // Droit VIP = `users.vip_expires_at` dans le futur (contrat v1.4) ; `subscriptions` garde l'historique.
      isVip: user.vipExpiresAt !== null && user.vipExpiresAt.getTime() > Date.now(),
      unlocked: new Set(unlocks.map((u) => u.episodeId)),
      country: user.country,
    };
  }
}

/** Statut d'un épisode pour un spectateur : gratuit, débloqué (achat/pub/VIP) ou verrouillé. */
export function computeAccess(
  episode: { id: string; number: number },
  series: { freeEpisodeCount: number },
  entitlements: Entitlements,
): EpisodeAccess {
  if (episode.number <= series.freeEpisodeCount) return 'free';
  if (entitlements.isVip) return 'unlocked';
  if (entitlements.unlocked.has(episode.id)) return 'unlocked';
  return 'locked';
}
