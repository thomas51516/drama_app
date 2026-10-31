import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { type Request } from 'express';
import { CatalogService } from '../catalog/catalog.service.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { ViewerCountry } from '../common/decorators/viewer-country.decorator.js';
import { ApiErrorDto } from '../common/dto/api-error.dto.js';
import { UuidPipe } from '../common/pipes/uuid.pipe.js';
import { type AuthenticatedUser } from '../common/request-context.js';
import { RateLimit } from '../common/rate-limit/rate-limit.decorator.js';
import { AdsService } from './ads.service.js';
import {
  AdEligibilityDto,
  AdEligibilityQueryDto,
  AdRewardAckDto,
  AdSessionCreatedDto,
  AdSessionStatusDto,
  CreateAdSessionDto,
} from './dto/ads.dto.js';

const SSV_DESCRIPTION =
  'Appelé par la régie (AdMob SSV), jamais par l’app : paramètres `ad_network, ad_unit, custom_data, reward_amount, reward_item, timestamp, transaction_id, user_id, signature, key_id` dans la chaîne de requête. La signature (ECDSA P-256 avec les clés publiques Google en mode `admob`, HMAC-SHA256 de `AD_SSV_FAKE_SECRET` en mode `fake`) couvre tout ce qui précède `&signature=`. `custom_data` = `customData` de la session ; déblocage `method: ad` sans débit, plafond quotidien, idempotent par `transaction_id`. Toujours `200` une fois la signature valide (`accepted: false` + `reason` sinon).';

/** Pub récompensée (M-22, S08-BE-03, contrat v1.5). */
@ApiTags('unlock')
@Controller('ads')
export class AdsController {
  constructor(
    private readonly ads: AdsService,
    private readonly catalog: CatalogService,
  ) {}

  @Get('eligibility')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Éligibilité d’un épisode à la pub récompensée',
    description:
      'Raisons de refus : `CAP_REACHED` (plafond `adDailyCap` atteint, jour civil du pays), `SERIES_NOT_ELIGIBLE` (`series.adUnlockEnabled` faux), `ALREADY_UNLOCKED` (gratuit, débloqué ou VIP), `NO_PROVIDER` (bloc AdMob non configuré). `adUnitId` à charger côté app ; `provider` = `fake` (régie simulée en debug) ou `admob`.',
  })
  @ApiHeader({ name: 'X-Country', required: false, example: 'TG' })
  @ApiOkResponse({ type: AdEligibilityDto })
  @ApiBadRequestResponse({ type: ApiErrorDto, description: 'VALIDATION_ERROR' })
  @ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'UNAUTHENTICATED' })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'EPISODE_NOT_FOUND' })
  async eligibility(
    @Query() query: AdEligibilityQueryDto,
    @CurrentUser() user: AuthenticatedUser,
    @ViewerCountry() country?: string,
  ): Promise<AdEligibilityDto> {
    const viewer = await this.catalog.viewerContext(user.id, { country });
    return this.ads.eligibility(user.id, query.episodeId, viewer);
  }

  @Post('sessions')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @RateLimit({ name: 'ads_sessions', limit: 20, windowSeconds: 900, scope: 'ip' })
  @ApiOperation({
    summary: 'Ouvrir une session de pub récompensée (10 min)',
    description:
      'Vérifie l’éligibilité (`409 AD_NOT_ELIGIBLE { details.reason }`) puis crée la session. L’app passe `customData` en `custom_data` SSV et son identifiant de compte en `user_id`, puis sonde `GET /ads/sessions/{id}` après la pub.',
  })
  @ApiHeader({ name: 'X-Country', required: false, example: 'TG' })
  @ApiCreatedResponse({ type: AdSessionCreatedDto })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'AD_NOT_ELIGIBLE' })
  @ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'UNAUTHENTICATED' })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'EPISODE_NOT_FOUND' })
  async createSession(
    @Body() dto: CreateAdSessionDto,
    @CurrentUser() user: AuthenticatedUser,
    @ViewerCountry() country?: string,
  ): Promise<AdSessionCreatedDto> {
    const viewer = await this.catalog.viewerContext(user.id, { country });
    return this.ads.createSession(user.id, dto.episodeId, viewer);
  }

  @Get('sessions/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'État d’une session (sondage de l’app après la pub)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: AdSessionStatusDto })
  @ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'UNAUTHENTICATED' })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'AD_SESSION_NOT_FOUND' })
  getSession(
    @Param('id', UuidPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AdSessionStatusDto> {
    return this.ads.getSession(user.id, id);
  }

  @Public()
  @Get('reward')
  @ApiTags('webhooks')
  @ApiOperation({ summary: 'Callback SSV de la régie (GET, AdMob)', description: SSV_DESCRIPTION })
  @ApiQuery({ name: 'custom_data', required: true })
  @ApiQuery({ name: 'transaction_id', required: true })
  @ApiQuery({ name: 'user_id', required: false })
  @ApiQuery({ name: 'signature', required: true })
  @ApiQuery({ name: 'key_id', required: false })
  @ApiOkResponse({ type: AdRewardAckDto })
  @ApiBadRequestResponse({ type: ApiErrorDto, description: 'AD_CALLBACK_INVALID' })
  @ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'INVALID_AD_SIGNATURE' })
  rewardGet(@Req() req: Request): Promise<AdRewardAckDto> {
    return this.ads.rewardFromSsv(rawQuery(req));
  }

  @Public()
  @Post('reward')
  @HttpCode(HttpStatus.OK)
  @ApiTags('webhooks')
  @ApiOperation({
    summary: 'Callback SSV de la régie (POST, mêmes paramètres de requête)',
    description: SSV_DESCRIPTION,
  })
  @ApiOkResponse({ type: AdRewardAckDto })
  @ApiBadRequestResponse({ type: ApiErrorDto, description: 'AD_CALLBACK_INVALID' })
  @ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'INVALID_AD_SIGNATURE' })
  rewardPost(@Req() req: Request): Promise<AdRewardAckDto> {
    return this.ads.rewardFromSsv(rawQuery(req));
  }
}

/** Chaîne de requête brute (l'ordre des paramètres fait partie du contenu signé). */
function rawQuery(req: Request): string {
  const url = req.originalUrl || req.url || '';
  const idx = url.indexOf('?');
  return idx === -1 ? '' : url.slice(idx + 1);
}
