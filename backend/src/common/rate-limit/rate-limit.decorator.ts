import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rateLimit';

/** Portée du compteur : adresse IP du client, e-mail ou numéro de téléphone du corps de requête. */
export type RateLimitScope = 'ip' | 'email' | 'phone';

export interface RateLimitRule {
  /** Nom stable de la limite (préfixe de clé Redis). */
  name: string;
  limit: number;
  windowSeconds: number;
  scope: RateLimitScope;
}

/**
 * Limitation de débit par fenêtre fixe dans Redis (S02-BE-02). Plusieurs règles possibles
 * sur une même route (ex. par IP ET par e-mail). Dépassement = 429 `RATE_LIMITED`.
 */
export const RateLimit = (...rules: RateLimitRule[]) => SetMetadata(RATE_LIMIT_KEY, rules);
