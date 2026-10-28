import { Body, Controller, Param, Post } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { type AuthenticatedUser } from '../common/request-context.js';
import { BillingService } from './billing.service.js';

@ApiExcludeController()
@Controller()
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  // TODO S07-BE-06
  @Post('billing/google/verify')
  verifyGoogle(@Body() payload: unknown, @CurrentUser() user: AuthenticatedUser): never {
    return this.billing.verifyGooglePurchase(user.id, payload);
  }

  // TODO S07-BE-07 : authentifié par la signature Pub/Sub, pas par un JWT utilisateur
  @Public()
  @Post('webhooks/google-rtdn')
  googleRtdn(@Body() payload: unknown): never {
    return this.billing.handleGoogleRtdn(payload);
  }

  // TODO S09-BE-01 : authentifié par la signature de l'agrégateur
  @Public()
  @Post('webhooks/mobile-money/:provider')
  mobileMoney(@Param('provider') provider: string, @Body() payload: unknown): never {
    return this.billing.handleMobileMoneyWebhook(provider, payload);
  }
}
