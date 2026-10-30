import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { AppConfig } from '../../config/app-config.js';

export interface GoogleIdentity {
  sub: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
}

/**
 * Vérification de l'ID token Google (S05-BE-01) : signature, expiration et audience parmi
 * `GOOGLE_CLIENT_IDS` (identifiants OAuth Web et Android). Sans identifiant configuré, la
 * connexion Google est désactivée (503 `GOOGLE_AUTH_DISABLED`).
 */
@Injectable()
export class GoogleTokenVerifier {
  private readonly logger = new Logger(GoogleTokenVerifier.name);
  private readonly client = new OAuth2Client();

  constructor(private readonly config: AppConfig) {}

  get enabled(): boolean {
    return this.config.googleClientIds.length > 0;
  }

  async verify(idToken: string): Promise<GoogleIdentity> {
    const audience = this.config.googleClientIds;
    if (audience.length === 0) {
      throw new ServiceUnavailableException({
        code: 'GOOGLE_AUTH_DISABLED',
        message: 'Google sign-in is not configured on this server (GOOGLE_CLIENT_IDS)',
      });
    }
    try {
      const ticket = await this.client.verifyIdToken({ idToken, audience });
      const payload = ticket.getPayload();
      if (!payload?.sub) throw new Error('missing subject');
      return {
        sub: payload.sub,
        email: payload.email ?? null,
        emailVerified: payload.email_verified === true,
        name: payload.name ?? null,
      };
    } catch (err) {
      this.logger.warn(`Google ID token rejected: ${(err as Error).message}`);
      throw new UnauthorizedException({
        code: 'GOOGLE_TOKEN_INVALID',
        message: 'Google ID token is invalid, expired or issued for another client',
      });
    }
  }
}
