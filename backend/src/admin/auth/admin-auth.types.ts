import { type AdminRole } from '../../generated/prisma/client.js';

/** JWT de défi émis après le mot de passe, consommé par /totp/verify (aud `admin-challenge`). */
export interface AdminChallengePayload {
  sub: string;
  jti: string;
  /** `true` = premier code d'un enrôlement TOTP (le secret est en attente de validation). */
  setup: boolean;
}

/** JWT d'accès admin (aud `admin`). */
export interface AdminAccessPayload {
  sub: string;
  jti: string;
  email: string;
  role: AdminRole;
  exp?: number;
}

export interface AdminClientMeta {
  ip?: string;
  userAgent?: string;
}

export const CHALLENGE_TTL_SECONDS = 300;
