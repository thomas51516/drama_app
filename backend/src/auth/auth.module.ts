import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AppConfig } from '../config/app-config.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';

/**
 * Auth (§8.2) : compte invité, rotation des jetons.
 * TODO S05-BE-01 /auth/google — TODO S05-BE-02 /auth/otp/* — TODO S05-BE-03 e-mail + rattachement invité.
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        secret: config.jwtAccessSecret,
        signOptions: { expiresIn: config.accessTokenTtlSeconds, issuer: 'drama-api' },
        verifyOptions: { issuer: 'drama-api' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, { provide: APP_GUARD, useClass: JwtAuthGuard }],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
