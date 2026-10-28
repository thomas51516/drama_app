import { type UserType } from '../generated/prisma/client.js';

/** Charge utile du JWT d'accès (courte durée). */
export interface AccessTokenPayload {
  /** Identifiant de l'utilisateur. */
  sub: string;
  /** Type de sujet : utilisateur final (les comptes internes auront `admin`). */
  typ: 'user';
  /** Type d'utilisateur (invité / inscrit). */
  ut: UserType;
}

export interface ClientMeta {
  userAgent?: string;
}
