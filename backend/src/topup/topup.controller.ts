import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  Redirect,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiExcludeEndpoint,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { type Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { ApiErrorDto } from '../common/dto/api-error.dto.js';
import { UuidPipe } from '../common/pipes/uuid.pipe.js';
import { type AuthenticatedUser } from '../common/request-context.js';
import { AppConfig } from '../config/app-config.js';
import {
  CreateTopupOrderDto,
  FakePayDto,
  TopupOrderCreatedDto,
  TopupOrderDto,
  TopupOrdersDto,
  TopupOrdersQueryDto,
  WebhookAckDto,
} from './dto/topup.dto.js';
import { renderFakePaymentPage } from './fake-payment-page.js';
import { TopupService } from './topup.service.js';

/** Recharge mobile money (M-34, S09-BE-01/02, contrat v1.5). */
@ApiTags('billing')
@Controller()
export class TopupController {
  constructor(
    private readonly topup: TopupService,
    private readonly config: AppConfig,
  ) {}

  @Post('topup/orders')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Créer une commande de recharge mobile money',
    description:
      'Prix du pack dans la devise du `country` (XOF, NGN, GHS, EUR, repli USD). `paymentUrl` = page de paiement de l’agrégateur (`MOBILE_MONEY_PROVIDER=cinetpay`) ou page simulée `/topup/fake/{orderId}` (`fake`, dev). Idempotent par `idempotencyKey`. La commande expire après 1 h ; les pièces sont créditées uniquement par le webhook signé.',
  })
  @ApiCreatedResponse({ type: TopupOrderCreatedDto })
  @ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'UNAUTHENTICATED' })
  @ApiForbiddenResponse({ type: ApiErrorDto, description: 'USER_BLOCKED' })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'PACK_NOT_FOUND' })
  @ApiResponse({
    status: 400,
    type: ApiErrorDto,
    description: 'VALIDATION_ERROR | PACK_UNAVAILABLE',
  })
  @ApiResponse({ status: 502, type: ApiErrorDto, description: 'PAYMENT_PROVIDER_ERROR' })
  createOrder(
    @Body() dto: CreateTopupOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TopupOrderCreatedDto> {
    return this.topup.createOrder(user.id, dto);
  }

  @Get('topup/orders')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Historique des recharges du compte' })
  @ApiOkResponse({ type: TopupOrdersDto })
  @ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'UNAUTHENTICATED' })
  listOrders(
    @Query() query: TopupOrdersQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TopupOrdersDto> {
    return this.topup.listOrders(user.id, query);
  }

  @Get('topup/orders/:id')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'État d’une commande (sondage du site après paiement)',
    description:
      '`PENDING | PAID | FAILED | EXPIRED` ; `creditedAt` renseigné quand le portefeuille a été crédité.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: TopupOrderDto })
  @ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'UNAUTHENTICATED' })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'ORDER_NOT_FOUND' })
  getOrder(
    @Param('id', UuidPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TopupOrderDto> {
    return this.topup.getOrder(user.id, id);
  }

  // ------------------------------------------------------------------ webhook agrégateur

  @ApiTags('webhooks')
  @Public()
  @Post('webhooks/mobile-money/:provider')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Webhook agrégateur mobile money (signé)',
    description:
      '`cinetpay` : notification `application/x-www-form-urlencoded` (`cpm_trans_id` = id de commande) avec en-tête `x-token` = HMAC-SHA256(`CINETPAY_SECRET`, champs concaténés), puis confirmation `POST /v2/payment/check`. `fake` : JSON `{ orderId, reference, status: paid|failed }` signé `X-Fake-Signature: sha256=<HMAC-SHA256(MOBILE_MONEY_FAKE_SECRET, corps brut)>`. Crédit idempotent par commande et par référence agrégateur (PURCHASE + BONUS du pack + offres).',
  })
  @ApiParam({ name: 'provider', example: 'cinetpay' })
  @ApiOkResponse({ type: WebhookAckDto })
  @ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'INVALID_WEBHOOK_SIGNATURE' })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'UNKNOWN_PROVIDER' })
  async webhook(
    @Param('provider') provider: string,
    @Req() req: Request & { rawBody?: Buffer },
    @Body() body: Record<string, unknown>,
  ): Promise<WebhookAckDto> {
    const result = await this.topup.handleWebhook(provider, {
      rawBody: req.rawBody?.toString('utf8') ?? '',
      headers: req.headers,
      body,
    });
    return {
      accepted: result === 'credited' || result === 'already_credited' || result === 'failed',
    };
  }

  // ------------------------------------------------------------------ page de paiement simulée (dev)

  @Public()
  @Get('topup/fake/:orderId')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Page de paiement simulée (agrégateur `fake`, dev uniquement)',
    description:
      'HTML français avec les boutons « Payer » / « Échouer » qui déclenchent le webhook `fake` signé. 404 avec un autre agrégateur.',
  })
  @ApiParam({ name: 'orderId', format: 'uuid' })
  @ApiProduces('text/html')
  @ApiOkResponse({ description: 'Page HTML' })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'ORDER_NOT_FOUND' })
  async fakePage(@Param('orderId', UuidPipe) orderId: string): Promise<string> {
    const order = await this.requireFakeOrder(orderId);
    return renderFakePaymentPage(
      order,
      `${this.config.topup.publicBaseUrl}/topup/fake/${order.id}`,
    );
  }

  @Public()
  @Post('topup/fake/:orderId')
  @Redirect()
  @ApiExcludeEndpoint()
  async fakePay(
    @Param('orderId', UuidPipe) orderId: string,
    @Body() dto: FakePayDto,
  ): Promise<{ url: string; statusCode: number }> {
    await this.requireFakeOrder(orderId);
    await this.topup.simulateFakePayment(orderId, dto.outcome);
    return { url: `${this.config.topup.publicBaseUrl}/topup/fake/${orderId}`, statusCode: 303 };
  }

  private async requireFakeOrder(orderId: string) {
    if (!this.topup.fakePageAvailable()) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Fake payment page is only available with the fake provider',
      });
    }
    const order = await this.topup.findOrder(orderId);
    if (!order)
      throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Top-up order not found' });
    return order;
  }
}
