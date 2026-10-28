import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AdminRoute } from '../../common/decorators/admin-route.decorator.js';
import { CurrentAdmin } from '../../common/decorators/current-admin.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { ApiErrorDto } from '../../common/dto/api-error.dto.js';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator.js';
import { type AuthenticatedAdmin } from '../../common/request-context.js';
import { AdminAuthGuard } from './admin-auth.guard.js';
import { AdminAuthService } from './admin-auth.service.js';
import {
  AdminLoginDto,
  AdminLoginResponseDto,
  AdminSessionDto,
  AdminTotpVerifyDto,
  AdminUserDto,
} from './dto/admin-auth.dto.js';

@ApiTags('admin-auth')
@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly auth: AdminAuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @RateLimit(
    { name: 'admin_login_email', limit: 5, windowSeconds: 900, scope: 'email' },
    { name: 'admin_login_ip', limit: 20, windowSeconds: 900, scope: 'ip' },
  )
  @ApiOperation({
    summary: 'Connexion back-office (étape 1 : mot de passe)',
    description:
      "Vérifie le mot de passe (Argon2id) et renvoie un jeton de défi valable 5 minutes. À la première connexion, le secret TOTP et l'URI otpauth sont renvoyés (`totp_setup_required`) : la 2FA est obligatoire. Limite : 5 tentatives par e-mail et par 15 minutes.",
  })
  @ApiOkResponse({ type: AdminLoginResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'INVALID_CREDENTIALS' })
  @ApiForbiddenResponse({ type: ApiErrorDto, description: 'ADMIN_INACTIVE' })
  @ApiTooManyRequestsResponse({ type: ApiErrorDto, description: 'RATE_LIMITED' })
  login(@Body() dto: AdminLoginDto, @Ip() ip: string): Promise<AdminLoginResponseDto> {
    return this.auth.login(dto, { ip });
  }

  @Public()
  @Post('totp/verify')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ name: 'admin_totp_ip', limit: 30, windowSeconds: 900, scope: 'ip' })
  @ApiOperation({
    summary: 'Connexion back-office (étape 2 : code TOTP)',
    description:
      "Valide le code à 6 chiffres (fenêtre ±1 pas de 30 s) et émet le JWT admin. Le jeton de défi est à usage unique. Lors de l'enrôlement, le premier code valide active la 2FA du compte.",
  })
  @ApiOkResponse({ type: AdminSessionDto })
  @ApiUnauthorizedResponse({
    type: ApiErrorDto,
    description: 'INVALID_CHALLENGE | CHALLENGE_EXPIRED | CHALLENGE_USED | INVALID_TOTP_CODE',
  })
  @ApiTooManyRequestsResponse({ type: ApiErrorDto, description: 'RATE_LIMITED' })
  verify(
    @Body() dto: AdminTotpVerifyDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<AdminSessionDto> {
    return this.auth.verifyTotp(dto, { ip, userAgent });
  }

  @AdminRoute()
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth('admin')
  @Get('me')
  @ApiOperation({ summary: 'Compte interne courant' })
  @ApiOkResponse({ type: AdminUserDto })
  @ApiUnauthorizedResponse({
    type: ApiErrorDto,
    description: 'UNAUTHENTICATED | INVALID_ADMIN_TOKEN | ADMIN_TOKEN_REVOKED | ADMIN_INACTIVE',
  })
  me(@CurrentAdmin() admin: AuthenticatedAdmin): Promise<AdminUserDto> {
    return this.auth.me(admin);
  }

  @AdminRoute()
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth('admin')
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Déconnexion',
    description: "Révoque le jeton courant (liste de refus Redis jusqu'à son expiration).",
  })
  @ApiNoContentResponse()
  @ApiUnauthorizedResponse({ type: ApiErrorDto })
  logout(@CurrentAdmin() admin: AuthenticatedAdmin, @Ip() ip: string): Promise<void> {
    return this.auth.logout(admin, { ip });
  }
}
