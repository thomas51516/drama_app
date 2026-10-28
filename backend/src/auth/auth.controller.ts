import { Body, Controller, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotImplementedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator.js';
import { ApiErrorDto } from '../common/dto/api-error.dto.js';
import { notImplemented } from '../common/errors/not-implemented.js';
import { RateLimit } from '../common/rate-limit/rate-limit.decorator.js';
import { AuthService } from './auth.service.js';
import { AuthResponseDto } from './dto/auth-response.dto.js';
import { GuestAuthDto } from './dto/guest-auth.dto.js';
import {
  GoogleAuthDto,
  OtpRequestDto,
  OtpRequestResponseDto,
  OtpVerifyDto,
} from './dto/auth-stubs.dto.js';
import { RefreshTokenDto } from './dto/refresh.dto.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('guest')
  @HttpCode(HttpStatus.CREATED)
  @RateLimit({ name: 'auth_guest', limit: 30, windowSeconds: 900, scope: 'ip' })
  @ApiOperation({
    summary: 'Créer un compte invité',
    description:
      "Appelé au premier lancement (M-50). Crée un utilisateur `GUEST` avec son portefeuille et renvoie une paire de jetons. Chaque appel crée un nouveau compte : l'app doit conserver le jeton de rafraîchissement.",
  })
  @ApiCreatedResponse({ type: AuthResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorDto })
  @ApiTooManyRequestsResponse({ type: ApiErrorDto, description: 'RATE_LIMITED (30 / 15 min / IP)' })
  guest(
    @Body() dto: GuestAuthDto,
    @Headers('user-agent') userAgent?: string,
  ): Promise<AuthResponseDto> {
    return this.auth.createGuest(dto, { userAgent });
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ name: 'auth_refresh', limit: 120, windowSeconds: 900, scope: 'ip' })
  @ApiOperation({
    summary: 'Renouveler les jetons',
    description:
      "Émet un nouveau JWT d'accès et un nouveau jeton de rafraîchissement ; l'ancien jeton est révoqué (rotation). Réutiliser un jeton révoqué révoque toute la session (401 `REFRESH_TOKEN_REUSED`).",
  })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiUnauthorizedResponse({
    type: ApiErrorDto,
    description: 'INVALID_REFRESH_TOKEN | REFRESH_TOKEN_REUSED | REFRESH_TOKEN_EXPIRED',
  })
  @ApiForbiddenResponse({ type: ApiErrorDto, description: 'USER_BLOCKED' })
  @ApiTooManyRequestsResponse({
    type: ApiErrorDto,
    description: 'RATE_LIMITED (120 / 15 min / IP)',
  })
  refresh(
    @Body() dto: RefreshTokenDto,
    @Headers('user-agent') userAgent?: string,
  ): Promise<AuthResponseDto> {
    return this.auth.refresh(dto, { userAgent });
  }

  // TODO S05-BE-01 : connexion Google (vérification de l'ID token, rattachement du compte invité)
  @Public()
  @Post('google')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ name: 'auth_google', limit: 30, windowSeconds: 900, scope: 'ip' })
  @ApiOperation({
    summary: 'Connexion Google (planifié S05-BE-01)',
    description:
      "Vérifie l'ID token Google, crée ou retrouve le compte inscrit et rattache le compte invité (`deviceId`). Répond 501 `NOT_IMPLEMENTED` jusqu'au sprint 5.",
  })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiNotImplementedResponse({ type: ApiErrorDto, description: 'NOT_IMPLEMENTED' })
  google(@Body() _dto: GoogleAuthDto): never {
    return notImplemented('S05-BE-01');
  }

  // TODO S05-BE-02 : OTP SMS (fournisseur choisi en S02-PM-01)
  @Public()
  @Post('otp/request')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ name: 'auth_otp_request', limit: 10, windowSeconds: 900, scope: 'ip' })
  @ApiOperation({
    summary: 'Demander un code OTP par SMS (planifié S05-BE-02)',
    description: "Répond 501 `NOT_IMPLEMENTED` jusqu'au sprint 5.",
  })
  @ApiOkResponse({ type: OtpRequestResponseDto })
  @ApiNotImplementedResponse({ type: ApiErrorDto, description: 'NOT_IMPLEMENTED' })
  otpRequest(@Body() _dto: OtpRequestDto): never {
    return notImplemented('S05-BE-02');
  }

  @Public()
  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ name: 'auth_otp_verify', limit: 20, windowSeconds: 900, scope: 'ip' })
  @ApiOperation({
    summary: 'Vérifier le code OTP et ouvrir la session (planifié S05-BE-02)',
    description: "Répond 501 `NOT_IMPLEMENTED` jusqu'au sprint 5.",
  })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiNotImplementedResponse({ type: ApiErrorDto, description: 'NOT_IMPLEMENTED' })
  otpVerify(@Body() _dto: OtpVerifyDto): never {
    return notImplemented('S05-BE-02');
  }
}
