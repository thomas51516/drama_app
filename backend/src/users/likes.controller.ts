import { Controller, Delete, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { LikeResultDto } from '../catalog/dto/catalog.dto.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { ApiErrorDto } from '../common/dto/api-error.dto.js';
import { type AuthenticatedUser } from '../common/request-context.js';
import { FavoritesService } from './favorites.service.js';
import { UuidPipe } from '../common/pipes/uuid.pipe.js';

/** « J'aime » sur une série (S05-BE-05, M-16). Jeton utilisateur obligatoire. */
@ApiTags('users')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'UNAUTHENTICATED | INVALID_TOKEN' })
@ApiNotFoundResponse({ type: ApiErrorDto, description: 'SERIES_NOT_FOUND' })
@Controller('series/:id/like')
export class LikesController {
  constructor(private readonly favorites: FavoritesService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Aimer une série (idempotent)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: LikeResultDto })
  like(
    @Param('id', UuidPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<LikeResultDto> {
    return this.favorites.like(user.id, id);
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retirer son « J’aime » (idempotent)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: LikeResultDto })
  unlike(
    @Param('id', UuidPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<LikeResultDto> {
    return this.favorites.unlike(user.id, id);
  }
}
