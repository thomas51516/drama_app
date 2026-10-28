import { type Request } from 'express';
import { type AdminRole, type UserType } from '../generated/prisma/client.js';

export interface AuthenticatedUser {
  id: string;
  type: UserType;
}

/** Compte interne authentifié par un JWT admin (`aud: admin`). */
export interface AuthenticatedAdmin {
  id: string;
  email: string;
  displayName: string;
  role: AdminRole;
  /** Identifiant du jeton, utilisé par la liste de révocation (logout). */
  jti: string;
  /** Expiration du jeton (secondes epoch). */
  exp: number;
}

export type RequestWithContext = Request & {
  user?: AuthenticatedUser;
  admin?: AuthenticatedAdmin;
  requestId?: string;
};
