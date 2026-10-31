import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CatalogService } from '../catalog/catalog.service.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { ViewerCountry } from '../common/decorators/viewer-country.decorator.js';
import { ApiErrorDto } from '../common/dto/api-error.dto.js';
import { UuidPipe } from '../common/pipes/uuid.pipe.js';
import { RateLimit } from '../common/rate-limit/rate-limit.decorator.js';
import { type AuthenticatedUser } from '../common/request-context.js';
import {
  SeriesUnlocksDto,
  UnlockAllQuoteDto,
  UnlockAllResultDto,
  UnlockEpisodeDto,
  UnlockResultDto,
} from './dto/unlock.dto.js';
import { UnlockService } from './unlock.service.js';

/** Déblocage (§8.2, §8.4, contrats v1.4 et v1.5) : pièces (S07-BE-02), série entière (S10-BE-02) ; pub récompensée : `ads/`. */
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
  // Limite les tentatives de déblocage (S10-OPS sécurité) : la transaction débite le portefeuille,
  // pas de raison de la laisser sans limite même si elle est idempotente.
  @RateLimit({ name: 'episode_unlock', limit: 30, windowSeconds: 900, scope: 'ip' })
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

  @Get('series/:id/unlock-all/quote')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Devis du déblocage de la série entière (M-23)',
    description:
      '`lockedCount` = épisodes visibles encore verrouillés pour le compte ; `fullPrice` = somme des coûts unitaires ; `price` = remise `seriesUnlockDiscountPercent` appliquée, arrondie au supérieur.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiHeader({ name: 'X-Country', required: false, example: 'TG' })
  @ApiOkResponse({ type: UnlockAllQuoteDto })
  @ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'UNAUTHENTICATED' })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'SERIES_NOT_FOUND' })
  async unlockAllQuote(
    @Param('id', UuidPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @ViewerCountry() country?: string,
  ): Promise<UnlockAllQuoteDto> {
    const viewer = await this.catalog.viewerContext(user.id, { country });
    return this.unlock.quoteUnlockAll(user.id, id, viewer);
  }

  @Post('series/:id/unlock-all')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @RateLimit({ name: 'series_unlock_all', limit: 30, windowSeconds: 900, scope: 'ip' })
  @ApiOperation({
    summary: 'Débloquer tous les épisodes verrouillés de la série (M-23)',
    description:
      'Une transaction : verrou du portefeuille, création de tous les déblocages et une ligne de débit par lot consommé (bonus d’abord). Idempotent par `idempotencyKey` (rejeu → même liste, aucun second débit). Solde insuffisant → `402 INSUFFICIENT_COINS { cost, balance }` ; série déjà débloquée → liste vide, `charged: {0,0}`.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiHeader({ name: 'X-Country', required: false, example: 'TG' })
  @ApiOkResponse({ type: UnlockAllResultDto })
  @ApiResponse({ status: 402, type: ApiErrorDto, description: 'INSUFFICIENT_COINS' })
  @ApiBadRequestResponse({ type: ApiErrorDto, description: 'VALIDATION_ERROR' })
  @ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'UNAUTHENTICATED' })
  @ApiForbiddenResponse({ type: ApiErrorDto, description: 'USER_BLOCKED' })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'SERIES_NOT_FOUND' })
  async unlockAll(
    @Param('id', UuidPipe) id: string,
    @Body() dto: UnlockEpisodeDto,
    @CurrentUser() user: AuthenticatedUser,
    @ViewerCountry() country?: string,
  ): Promise<UnlockAllResultDto> {
    const viewer = await this.catalog.viewerContext(user.id, { country });
    return this.unlock.unlockAll(user.id, id, dto.idempotencyKey, viewer);
  }
}
