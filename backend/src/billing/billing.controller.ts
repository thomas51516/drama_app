import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { ViewerCountry } from '../common/decorators/viewer-country.decorator.js';
import { ApiErrorDto } from '../common/dto/api-error.dto.js';
import { type AuthenticatedUser } from '../common/request-context.js';
import { BillingService } from './billing.service.js';
import {
  GoogleRtdnDto,
  GoogleVerifyDto,
  SubscriptionStatusDto,
  VerifyResultDto,
} from './dto/billing.dto.js';

/** Paiements (§10, contrat v1.4) : Google Play (S07-BE-06/07) ; mobile money : `topup/` (S09-BE-01). */
@Controller()
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @ApiTags('billing')
  @Post('billing/google/verify')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Vérifier un achat Google Play et créditer le compte (M-31)',
    description:
      'Vérification serveur (`BILLING_VERIFIER=google|fake`), puis crédit par deux lignes du grand livre (PURCHASE achetées + BONUS expirables) ou activation du VIP (`subs`), puis acquittement. Idempotent par `purchaseToken` : un second appel répond `already_processed` sans recréditer. Restauration des achats : rejouer les jetons connus de Play Billing.',
  })
  @ApiOkResponse({ type: VerifyResultDto })
  @ApiBadRequestResponse({
    type: ApiErrorDto,
    description: 'PURCHASE_INVALID (details.reason) | VALIDATION_ERROR',
  })
  @ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'UNAUTHENTICATED' })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'PURCHASE_OWNED_BY_OTHER' })
  verifyGoogle(
    @Body() dto: GoogleVerifyDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<VerifyResultDto> {
    return this.billing.verifyGooglePurchase(user.id, dto);
  }

  @ApiTags('users')
  @Get('me/subscription')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Abonnement VIP du compte : statut, formule, échéance, renouvellement (M-33)',
    description:
      '`status` : none, active, cancelled (accès jusqu’à l’échéance), grace, expired. Géré depuis Google Play.',
  })
  @ApiOkResponse({ type: SubscriptionStatusDto })
  @ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'UNAUTHENTICATED' })
  subscription(
    @CurrentUser() user: AuthenticatedUser,
    @ViewerCountry() country?: string,
  ): Promise<SubscriptionStatusDto> {
    return this.billing.getSubscription(user.id, country);
  }

  @ApiTags('webhooks')
  @Public()
  @Post('webhooks/google-rtdn')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Real-time developer notifications Google Play (Pub/Sub push)',
    description:
      'Corps Pub/Sub (`message.data` = DeveloperNotification en base64). Renouvellement, annulation, pause, remboursement : le jeton est revérifié auprès du magasin, `subscriptions` et `users.vip_*` mis à jour, un remboursement de pack produit des lignes REFUND négatives. Si `GOOGLE_RTDN_AUTH_TOKEN` est défini, il doit être présenté en `?token=` ou `Authorization: Bearer`.',
  })
  @ApiNoContentResponse()
  @ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'INVALID_WEBHOOK_SIGNATURE' })
  async googleRtdn(
    @Body() payload: GoogleRtdnDto,
    @Query('token') token?: string,
    @Headers('authorization') authorization?: string,
  ): Promise<void> {
    const bearer = authorization?.toLowerCase().startsWith('bearer ')
      ? authorization.slice(7).trim()
      : undefined;
    await this.billing.handleGoogleRtdn(payload, token ?? bearer);
  }
}
