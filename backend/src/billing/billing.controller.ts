import { Body, Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotImplementedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { ApiErrorDto } from '../common/dto/api-error.dto.js';
import { type AuthenticatedUser } from '../common/request-context.js';
import { BillingService } from './billing.service.js';
import {
  GoogleRtdnDto,
  GoogleVerifyDto,
  MobileMoneyWebhookDto,
  PurchaseResultDto,
  WebhookAckDto,
} from './dto/billing.dto.js';

/** Paiements (§10). Planifié S07-BE-06/07 (Google Play) et S09-BE-01 (mobile money). */
@ApiNotImplementedResponse({ type: ApiErrorDto, description: 'NOT_IMPLEMENTED' })
@Controller()
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  // TODO S07-BE-06
  @ApiTags('billing')
  @Post('billing/google/verify')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Vérifier un achat Google Play et créditer (planifié S07-BE-06)',
    description:
      'Vérification serveur via la Google Play Developer API, crédit par ligne de grand livre, acquittement. Idempotent par `purchaseToken`.',
  })
  @ApiOkResponse({ type: PurchaseResultDto })
  @ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'UNAUTHENTICATED' })
  @ApiUnprocessableEntityResponse({
    type: ApiErrorDto,
    description: 'PURCHASE_INVALID | PURCHASE_NOT_PAID',
  })
  verifyGoogle(@Body() payload: GoogleVerifyDto, @CurrentUser() user: AuthenticatedUser): never {
    return this.billing.verifyGooglePurchase(user.id, payload);
  }

  // TODO S07-BE-07 : authentifié par la signature Pub/Sub, pas par un JWT utilisateur
  @ApiTags('webhooks')
  @Public()
  @Post('webhooks/google-rtdn')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Real-time developer notifications Google Play (planifié S07-BE-07)',
    description: 'Push Pub/Sub authentifié par jeton OIDC ; traitement asynchrone (BullMQ).',
  })
  @ApiOkResponse({ type: WebhookAckDto })
  @ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'INVALID_WEBHOOK_SIGNATURE' })
  googleRtdn(@Body() payload: GoogleRtdnDto): never {
    return this.billing.handleGoogleRtdn(payload);
  }

  // TODO S09-BE-01 : authentifié par la signature de l'agrégateur
  @ApiTags('webhooks')
  @Public()
  @Post('webhooks/mobile-money/:provider')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Webhook agrégateur mobile money (planifié S09-BE-01)',
    description:
      'Signature vérifiée, idempotent par identifiant de transaction, crédit par grand livre.',
  })
  @ApiParam({ name: 'provider', example: 'cinetpay' })
  @ApiOkResponse({ type: WebhookAckDto })
  @ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'INVALID_WEBHOOK_SIGNATURE' })
  mobileMoney(@Param('provider') provider: string, @Body() payload: MobileMoneyWebhookDto): never {
    return this.billing.handleMobileMoneyWebhook(provider, payload);
  }
}
