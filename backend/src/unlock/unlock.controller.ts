import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiNotImplementedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CatalogService } from '../catalog/catalog.service.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { ViewerCountry } from '../common/decorators/viewer-country.decorator.js';
import { ApiErrorDto } from '../common/dto/api-error.dto.js';
import { UuidPipe } from '../common/pipes/uuid.pipe.js';
import { type AuthenticatedUser } from '../common/request-context.js';
import {
  AdRewardAckDto,
  AdRewardCallbackDto,
  SeriesUnlocksDto,
  UnlockEpisodeDto,
  UnlockResultDto,
} from './dto/unlock.dto.js';
import { UnlockService } from './unlock.service.js';

/** Déblocage (§8.2, §8.4, contrat v1.4) : pièces (S07-BE-02) ; pub récompensée planifiée S08-BE-03. */
@ApiTags('unlock')
@Controller()
export class UnlockController {
  constructor(
    private readonly unlock: UnlockService,
    private readonly catalog: CatalogService,
  ) {}

  @Post('episodes/:id/unlock')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Débloquer un épisode avec des pièces (M-21)',
    description:
      'Coût = `series.coinCostPerEpisode`. Débit (bonus avant achetées, lots les plus proches de l’expiration d’abord) et création du déblocage dans la même transaction ; idempotent par (utilisateur, épisode) et par `idempotencyKey`. Déjà débloqué → `200` avec la méthode d’origine et `charged: {0,0}` ; épisode gratuit → `method: free` ; abonné VIP → `method: vip` sans débit. Solde insuffisant ou négatif → `402 INSUFFICIENT_COINS { details: { cost, balance } }`.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiHeader({ name: 'X-Country', required: false, example: 'TG' })
  @ApiOkResponse({ type: UnlockResultDto })
  @ApiResponse({ status: 402, type: ApiErrorDto, description: 'INSUFFICIENT_COINS' })
  @ApiBadRequestResponse({ type: ApiErrorDto, description: 'VALIDATION_ERROR' })
  @ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'UNAUTHENTICATED' })
  @ApiForbiddenResponse({ type: ApiErrorDto, description: 'USER_BLOCKED' })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'EPISODE_NOT_FOUND' })
  async unlockEpisode(
    @Param('id', UuidPipe) id: string,
    @Body() dto: UnlockEpisodeDto,
    @CurrentUser() user: AuthenticatedUser,
    @ViewerCountry() country?: string,
  ): Promise<UnlockResultDto> {
    const viewer = await this.catalog.viewerContext(user.id, { country });
    return this.unlock.unlockWithCoins(user.id, id, dto.idempotencyKey, viewer);
  }

  @Get('series/:id/unlocks')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Épisodes d’une série déjà débloqués par le compte (M-32)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: SeriesUnlocksDto })
  @ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'UNAUTHENTICATED' })
  seriesUnlocks(
    @Param('id', UuidPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SeriesUnlocksDto> {
    return this.unlock.listSeriesUnlocks(user.id, id);
  }

  // TODO S08-BE-03 : callback serveur de la régie (signé), pas d'auth utilisateur
  @Public()
  @Post('ads/reward')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Callback SSV de la régie publicitaire (planifié S08-BE-03)',
    description:
      'Appelé par la régie, jamais par l’app. Crédit uniquement après vérification de la signature ; plafond quotidien par utilisateur (Redis). Idempotent par `transactionId`.',
  })
  @ApiOkResponse({ type: AdRewardAckDto })
  @ApiNotImplementedResponse({ type: ApiErrorDto, description: 'NOT_IMPLEMENTED' })
  @ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'INVALID_AD_SIGNATURE' })
  adReward(@Body() payload: AdRewardCallbackDto): never {
    return this.unlock.rewardFromAd(payload);
  }
}
