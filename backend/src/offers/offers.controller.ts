import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { ApiErrorDto } from '../common/dto/api-error.dto.js';
import { RateLimit } from '../common/rate-limit/rate-limit.decorator.js';
import { type AuthenticatedUser } from '../common/request-context.js';
import { OffersDto, RedeemPromoDto, RedeemPromoResultDto } from './dto/offers.dto.js';
import { OffersService } from './offers.service.js';

/** Offres et codes promo côté app (M-24, contrat v1.5). */
@ApiTags('billing')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'UNAUTHENTICATED' })
@Controller()
export class OffersController {
  constructor(private readonly offers: OffersService) {}

  @Get('offers')
  @ApiOperation({
    summary: 'Offres en cours pour le compte (M-24)',
    description:
      '`welcome` : bonus en % sur le premier achat pendant `welcomeOfferHours` après la création du compte (null si inapplicable : déjà acheté, fenêtre passée, offre inactive) ; `limited` : offres limitées actives (bonus % sur un pack). Les pourcentages sont appliqués par le serveur au crédit de l’achat (Google Play ou mobile money), jamais par l’app.',
  })
  @ApiOkResponse({ type: OffersDto })
  getOffers(@CurrentUser() user: AuthenticatedUser): Promise<OffersDto> {
    return this.offers.getOffers(user.id);
  }

  @Post('promo/redeem')
  @HttpCode(HttpStatus.OK)
  // Protège contre le bruteforce de codes (S10-OPS sécurité) : sans limite, un code promo court
  // se devine par essais répétés bien plus vite que son espace de combinaisons ne le permettrait.
  @RateLimit({ name: 'promo_redeem', limit: 10, windowSeconds: 900, scope: 'ip' })
  @ApiOperation({
    summary: 'Utiliser un code promo (M-24)',
    description:
      'Code insensible à la casse. Crédit BONUS expirable, idempotent par `idempotencyKey`. `404 PROMO_INVALID` (inconnu, inactif, pas encore commencé), `409 PROMO_EXPIRED | PROMO_EXHAUSTED | PROMO_ALREADY_USED`.',
  })
  @ApiOkResponse({ type: RedeemPromoResultDto })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'PROMO_INVALID' })
  @ApiConflictResponse({
    type: ApiErrorDto,
    description: 'PROMO_ALREADY_USED | PROMO_EXPIRED | PROMO_EXHAUSTED',
  })
  redeem(
    @Body() dto: RedeemPromoDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RedeemPromoResultDto> {
    return this.offers.redeemPromo(user.id, dto.code, dto.idempotencyKey);
  }
}
