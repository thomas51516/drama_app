import { Body, Controller, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator.js';
import { ApiErrorDto } from '../common/dto/api-error.dto.js';
import { AuthService } from './auth.service.js';
import { AuthResponseDto } from './dto/auth-response.dto.js';
import { GuestAuthDto } from './dto/guest-auth.dto.js';
import { RefreshTokenDto } from './dto/refresh.dto.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('guest')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Créer un compte invité',
    description:
      "Appelé au premier lancement (M-50). Crée un utilisateur `GUEST` avec son portefeuille et renvoie une paire de jetons. Chaque appel crée un nouveau compte : l'app doit conserver le jeton de rafraîchissement.",
  })
  @ApiCreatedResponse({ type: AuthResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorDto })
  guest(
    @Body() dto: GuestAuthDto,
    @Headers('user-agent') userAgent?: string,
  ): Promise<AuthResponseDto> {
    return this.auth.createGuest(dto, { userAgent });
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
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
  refresh(
    @Body() dto: RefreshTokenDto,
    @Headers('user-agent') userAgent?: string,
  ): Promise<AuthResponseDto> {
    return this.auth.refresh(dto, { userAgent });
  }
}
