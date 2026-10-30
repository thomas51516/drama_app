import { Body, Controller, HttpCode, HttpStatus, Param, Post, Put } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiHeader,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CatalogService } from '../catalog/catalog.service.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { ViewerCountry } from '../common/decorators/viewer-country.decorator.js';
import { ApiErrorDto } from '../common/dto/api-error.dto.js';
import { type AuthenticatedUser } from '../common/request-context.js';
import { PlaySessionDto, UpdateProgressDto, WatchProgressDto } from './dto/playback.dto.js';
import { PlaybackService } from './playback.service.js';
import { UuidPipe } from '../common/pipes/uuid.pipe.js';

@ApiTags('playback')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'UNAUTHENTICATED | INVALID_TOKEN' })
@ApiHeader({
  name: 'X-Country',
  required: false,
  description:
    'Pays du spectateur (ISO 3166-1 alpha-2) : même filtre territorial que le catalogue.',
  example: 'TG',
})
@ApiBadRequestResponse({ type: ApiErrorDto, description: 'VALIDATION_ERROR' })
@Controller()
export class PlaybackController {
  constructor(
    private readonly playback: PlaybackService,
    private readonly catalog: CatalogService,
  ) {}

  @Post('episodes/:id/play')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Obtenir l'URL de lecture d'un épisode",
    description:
      "Vérifie le droit (gratuit, débloqué, VIP) puis renvoie le manifeste HLS, les sous-titres, la position de reprise et l'épisode suivant. Le serveur fait foi (§8.4). Épisode verrouillé : si `autoUnlock` est activé et le solde suffisant, l'épisode est débloqué dans la même requête (`unlocked: true`) ; sinon `403 EPISODE_LOCKED { details: { coinCost, balance, canAutoUnlock } }`. Abonné VIP : toujours autorisé (déblocage `vip` enregistré sans débit).",
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: PlaySessionDto })
  @ApiForbiddenResponse({
    type: ApiErrorDto,
    description: 'EPISODE_LOCKED (details.coinCost, balance, canAutoUnlock)',
  })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'EPISODE_NOT_FOUND' })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'EPISODE_NOT_READY' })
  async play(
    @Param('id', UuidPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @ViewerCountry() country?: string,
  ): Promise<PlaySessionDto> {
    const viewer = await this.catalog.viewerContext(user.id, { country });
    return this.playback.play(user.id, id, viewer);
  }

  @Put('progress')
  @ApiOperation({
    summary: 'Enregistrer la position de lecture (M-15)',
    description:
      'Refusée sur un épisode verrouillé (403 `EPISODE_LOCKED`) ou invisible (404) : le serveur fait foi.',
  })
  @ApiOkResponse({ type: WatchProgressDto })
  @ApiForbiddenResponse({ type: ApiErrorDto, description: 'EPISODE_LOCKED' })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'EPISODE_NOT_FOUND' })
  async progress(
    @Body() dto: UpdateProgressDto,
    @CurrentUser() user: AuthenticatedUser,
    @ViewerCountry() country?: string,
  ): Promise<WatchProgressDto> {
    const viewer = await this.catalog.viewerContext(user.id, { country });
    return this.playback.saveProgress(user.id, dto, viewer);
  }
}
