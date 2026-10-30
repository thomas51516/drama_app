import { Module } from '@nestjs/common';
import { AppConfig } from '../../config/app-config.js';
import { AdminAuthController } from './admin-auth.controller.js';
import { AdminAuthGuard } from './admin-auth.guard.js';
import { AdminAuthService } from './admin-auth.service.js';
import { AdminJwtService } from './admin-jwt.service.js';
import { TrustedDeviceService } from './trusted-device.service.js';

/** Authentification des comptes internes (S03-BE-04) : Argon2id + TOTP obligatoire + JWT admin. */
@Module({
  controllers: [AdminAuthController],
  providers: [
    // Fabrique explicite : la classe hérite de JwtService et ne doit pas résoudre JWT_MODULE_OPTIONS.
    {
      provide: AdminJwtService,
      inject: [AppConfig],
      useFactory: (config: AppConfig): AdminJwtService => new AdminJwtService(config),
    },
    TrustedDeviceService,
    AdminAuthService,
    AdminAuthGuard,
  ],
  exports: [AdminJwtService, AdminAuthService, AdminAuthGuard, TrustedDeviceService],
})
export class AdminAuthModule {}
