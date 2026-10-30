import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AppConfig } from '../config/app-config.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { AccountMergeService } from './identity/account-merge.service.js';
import { GoogleTokenVerifier } from './identity/google-token.verifier.js';
import { IdentityAuthService } from './identity/identity-auth.service.js';
import { OtpService } from './otp/otp.service.js';
import { ConsoleSmsProvider } from './sms/console-sms.provider.js';
import { HttpSmsProvider } from './sms/http-sms.provider.js';
import { SMS_PROVIDER, type SmsProvider } from './sms/sms-provider.js';

/**
 * Auth (§8.2) : compte invité, rotation des jetons, Google (S05-BE-01), OTP SMS (S05-BE-02),
 * e-mail et rattachement / fusion du compte invité (S05-BE-03).
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
  providers: [
    AuthService,
    AccountMergeService,
    IdentityAuthService,
    GoogleTokenVerifier,
    OtpService,
    {
      provide: SMS_PROVIDER,
      inject: [AppConfig],
      useFactory: (config: AppConfig): SmsProvider =>
        config.sms.provider === 'http'
          ? new HttpSmsProvider(config.sms.httpUrl ?? '', config.sms.httpToken)
          : new ConsoleSmsProvider(),
    },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
