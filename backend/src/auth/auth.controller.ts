import { Body, Controller, Headers, HttpCode, HttpStatus, Ip, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiGoneResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { ApiErrorDto } from '../common/dto/api-error.dto.js';
import { RateLimit } from '../common/rate-limit/rate-limit.decorator.js';
import { type AuthenticatedUser } from '../common/request-context.js';
import { AuthService } from './auth.service.js';
import { AuthResponseDto } from './dto/auth-response.dto.js';
import {
  AuthSessionDto,
  EmailCredentialsDto,
  GoogleAuthDto,
  LogoutDto,
  OtpRequestDto,
  OtpRequestResponseDto,
  OtpVerifyDto,
} from './dto/auth-session.dto.js';
import { GuestAuthDto } from './dto/guest-auth.dto.js';
import { RefreshTokenDto } from './dto/refresh.dto.js';
import { GoogleTokenVerifier } from './identity/google-token.verifier.js';
import { IdentityAuthService } from './identity/identity-auth.service.js';
import { OtpService } from './otp/otp.service.js';

/**
 * Authentification (§8.2, M-50, M-51) : compte invité, rotation des jetons, connexion Google, OTP SMS,
 * e-mail, rattachement / fusion du compte invité, déconnexion. Toutes les sessions émettent les mêmes
 * JWT d'accès et jetons de rafraîchissement.
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly identity: IdentityAuthService,
    private readonly googleVerifier: GoogleTokenVerifier,
    private readonly otp: OtpService,
  ) {}

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

  @Public()
  @Post('google')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ name: 'auth_google', limit: 30, windowSeconds: 900, scope: 'ip' })
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Connexion Google (M-51)',
    description:
      "Vérifie l'ID token (audiences `GOOGLE_CLIENT_IDS`) puis ouvre la session. Avec un jeton de compte invité dans `Authorization`, l'identité est rattachée : invité inscrit en place si l'identité est inconnue, fusion de l'invité dans le compte existant sinon (`linked=true`, M-50).",
  })
  @ApiOkResponse({ type: AuthSessionDto })
  @ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'GOOGLE_TOKEN_INVALID' })
  @ApiForbiddenResponse({ type: ApiErrorDto, description: 'USER_BLOCKED' })
  @ApiServiceUnavailableResponse({ type: ApiErrorDto, description: 'GOOGLE_AUTH_DISABLED' })
  @ApiTooManyRequestsResponse({ type: ApiErrorDto, description: 'RATE_LIMITED (30 / 15 min / IP)' })
  async google(
    @Body() dto: GoogleAuthDto,
    @CurrentUser() current?: AuthenticatedUser,
    @Headers('user-agent') userAgent?: string,
    @Ip() ip?: string,
  ): Promise<AuthSessionDto> {
    const google = await this.googleVerifier.verify(dto.idToken);
    return this.identity.signIn(
      {
        provider: 'GOOGLE',
        subject: google.sub,
        email: google.emailVerified ? google.email : null,
        displayName: google.name,
      },
      { current, deviceId: dto.deviceId, userAgent, ip },
    );
  }

  @Public()
  @Post('otp/request')
  @HttpCode(HttpStatus.OK)
  @RateLimit(
    { name: 'auth_otp_phone', limit: 3, windowSeconds: 900, scope: 'phone' },
    { name: 'auth_otp_request', limit: 10, windowSeconds: 900, scope: 'ip' },
  )
  @ApiOperation({
    summary: 'Demander un code OTP par SMS (M-51)',
    description:
      'Code à 6 chiffres valable 5 min (5 essais), nouvel envoi possible après 60 s (`429 OTP_RESEND_TOO_SOON`). Limite : 3 demandes par numéro et 10 par IP par 15 min. En dev (`SMS_PROVIDER=console`), le code est dans les logs de l’API et dans Redis `otp:<requestId>`.',
  })
  @ApiOkResponse({ type: OtpRequestResponseDto })
  @ApiTooManyRequestsResponse({
    type: ApiErrorDto,
    description: 'RATE_LIMITED | OTP_RESEND_TOO_SOON (details.retryAfterSeconds)',
  })
  @ApiServiceUnavailableResponse({ type: ApiErrorDto, description: 'SMS_DELIVERY_FAILED' })
  otpRequest(@Body() dto: OtpRequestDto): Promise<OtpRequestResponseDto> {
    return this.otp.request(dto.phone);
  }

  @Public()
  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ name: 'auth_otp_verify', limit: 20, windowSeconds: 900, scope: 'ip' })
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Vérifier le code OTP et ouvrir la session (M-51)',
    description:
      'Consomme la demande ; mêmes règles de rattachement du compte invité que `/auth/google` (M-50).',
  })
  @ApiOkResponse({ type: AuthSessionDto })
  @ApiUnauthorizedResponse({
    type: ApiErrorDto,
    description: 'OTP_INVALID_CODE (details.attemptsLeft)',
  })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'OTP_REQUEST_NOT_FOUND' })
  @ApiGoneResponse({ type: ApiErrorDto, description: 'OTP_TOO_MANY_ATTEMPTS' })
  @ApiForbiddenResponse({ type: ApiErrorDto, description: 'USER_BLOCKED' })
  async otpVerify(
    @Body() dto: OtpVerifyDto,
    @CurrentUser() current?: AuthenticatedUser,
    @Headers('user-agent') userAgent?: string,
    @Ip() ip?: string,
  ): Promise<AuthSessionDto> {
    const phone = await this.otp.verify(dto.requestId, dto.code);
    return this.identity.signIn(
      { provider: 'PHONE', subject: phone, phone },
      { current, deviceId: dto.deviceId, userAgent, ip },
    );
  }

  @Public()
  @Post('email/register')
  @HttpCode(HttpStatus.CREATED)
  @RateLimit({ name: 'auth_email_register', limit: 10, windowSeconds: 900, scope: 'ip' })
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Créer un compte e-mail + mot de passe (M-51)',
    description:
      'Mot de passe de 8 caractères minimum (Argon2id). Avec un jeton invité, le compte invité devient inscrit en place (`linked=true`). `409 EMAIL_TAKEN` si l’e-mail est déjà utilisé (se connecter à la place).',
  })
  @ApiCreatedResponse({ type: AuthSessionDto })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'EMAIL_TAKEN' })
  @ApiTooManyRequestsResponse({ type: ApiErrorDto, description: 'RATE_LIMITED (10 / 15 min / IP)' })
  emailRegister(
    @Body() dto: EmailCredentialsDto,
    @CurrentUser() current?: AuthenticatedUser,
    @Headers('user-agent') userAgent?: string,
    @Ip() ip?: string,
  ): Promise<AuthSessionDto> {
    return this.identity.registerEmail(dto.email, dto.password, {
      current,
      deviceId: dto.deviceId,
      userAgent,
      ip,
    });
  }

  @Public()
  @Post('email/login')
  @HttpCode(HttpStatus.OK)
  @RateLimit(
    { name: 'auth_email_login', limit: 10, windowSeconds: 900, scope: 'email' },
    { name: 'auth_email_login_ip', limit: 30, windowSeconds: 900, scope: 'ip' },
  )
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Connexion e-mail + mot de passe (M-51)',
    description:
      'Avec un jeton invité, l’invité est fusionné dans le compte retrouvé (`linked=true`, M-50).',
  })
  @ApiOkResponse({ type: AuthSessionDto })
  @ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'INVALID_CREDENTIALS' })
  @ApiForbiddenResponse({ type: ApiErrorDto, description: 'USER_BLOCKED' })
  @ApiTooManyRequestsResponse({
    type: ApiErrorDto,
    description: 'RATE_LIMITED (10 / e-mail et 30 / IP par 15 min)',
  })
  emailLogin(
    @Body() dto: EmailCredentialsDto,
    @CurrentUser() current?: AuthenticatedUser,
    @Headers('user-agent') userAgent?: string,
    @Ip() ip?: string,
  ): Promise<AuthSessionDto> {
    return this.identity.loginEmail(dto.email, dto.password, {
      current,
      deviceId: dto.deviceId,
      userAgent,
      ip,
    });
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Fermer la session',
    description:
      'Révoque le jeton de rafraîchissement (et sa famille) s’il appartient à l’utilisateur courant. Toujours 204.',
  })
  @ApiNoContentResponse()
  @ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'UNAUTHENTICATED | INVALID_TOKEN' })
  async logout(@Body() dto: LogoutDto, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.auth.logout(user.id, dto.refreshToken);
  }
}
