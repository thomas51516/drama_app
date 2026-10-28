import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { ApiErrorDto } from '../common/dto/api-error.dto.js';
import { type AuthenticatedUser } from '../common/request-context.js';
import { PlaySessionDto, UpdateProgressDto, WatchProgressDto } from './dto/playback.dto.js';
import { PlaybackService } from './playback.service.js';

@ApiTags('playback')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'UNAUTHENTICATED | INVALID_TOKEN' })
@Controller()
export class PlaybackController {
  constructor(private readonly playback: PlaybackService) {}

  @Post('episodes/:id/play')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Obtenir l'URL de lecture d'un épisode",
    description:
      "Vérifie le droit (gratuit, débloqué, VIP) puis renvoie le manifeste HLS, les sous-titres, la position de reprise et l'épisode suivant. Le serveur fait foi (§8.4).",
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: PlaySessionDto })
  @ApiForbiddenResponse({ type: ApiErrorDto, description: 'EPISODE_LOCKED (details.coinCost)' })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'EPISODE_NOT_FOUND' })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'EPISODE_NOT_READY' })
  play(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PlaySessionDto> {
    return this.playback.play(user.id, id);
  }

  @Put('progress')
  @ApiOperation({ summary: 'Enregistrer la position de lecture (M-15)' })
  @ApiOkResponse({ type: WatchProgressDto })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'EPISODE_NOT_FOUND' })
  progress(
    @Body() dto: UpdateProgressDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<WatchProgressDto> {
    return this.playback.saveProgress(user.id, dto);
  }
}
