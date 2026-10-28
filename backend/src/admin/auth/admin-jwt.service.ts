import { JwtService } from '@nestjs/jwt';
import { type AppConfig } from '../../config/app-config.js';

export const ADMIN_JWT_ISSUER = 'drama-admin';
export const ADMIN_ACCESS_AUDIENCE = 'admin';
export const ADMIN_CHALLENGE_AUDIENCE = 'admin-challenge';

/**
 * Signataire des JWT du back-office : secret `ADMIN_JWT_SECRET` distinct du JWT utilisateur,
 * émetteur et audience propres. Un JWT utilisateur ne peut donc jamais ouvrir une route /admin/*.
 * Fourni par une fabrique dans AdminAuthModule (pas d'injection de JWT_MODULE_OPTIONS).
 */
export class AdminJwtService extends JwtService {
  constructor(config: AppConfig) {
    super({
      secret: config.admin.jwtSecret,
      signOptions: { issuer: ADMIN_JWT_ISSUER },
      verifyOptions: { issuer: ADMIN_JWT_ISSUER },
    });
  }
}
