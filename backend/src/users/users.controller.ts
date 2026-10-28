import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiNotImplementedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { ApiErrorDto } from '../common/dto/api-error.dto.js';
import { type AuthenticatedUser } from '../common/request-context.js';
import {
  DeleteMeResultDto,
  FavoriteDto,
  FavoritesDto,
  MeDto,
  UpdateMeDto,
} from './dto/users.dto.js';
import { UsersService } from './users.service.js';

/** Utilisateur (§8.2). Planifié S05-BE-04 (profil) et S05-BE-05 (favoris). */
@ApiTags('users')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'UNAUTHENTICATED | INVALID_TOKEN' })
@ApiNotImplementedResponse({ type: ApiErrorDto, description: 'NOT_IMPLEMENTED' })
@Controller('me')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  // TODO S05-BE-04
  @Get()
  @ApiOperation({ summary: 'Profil courant (planifié S05-BE-04)' })
  @ApiOkResponse({ type: MeDto })
  me(@CurrentUser() user: AuthenticatedUser): never {
    return this.users.getMe(user.id);
  }

  @Patch()
  @ApiOperation({ summary: 'Modifier le profil (planifié S05-BE-04)' })
  @ApiOkResponse({ type: MeDto })
  update(@Body() patch: UpdateMeDto, @CurrentUser() user: AuthenticatedUser): never {
    return this.users.updateMe(user.id, patch);
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Demander la suppression du compte (planifié S05-BE-04)',
    description: 'Passe le compte en DELETION_PENDING ; purge différée (§14).',
  })
  @ApiOkResponse({ type: DeleteMeResultDto })
  remove(@CurrentUser() user: AuthenticatedUser): never {
    return this.users.deleteMe(user.id);
  }

  // TODO S05-BE-05
  @Get('favorites')
  @ApiOperation({ summary: '« Ma liste » (planifié S05-BE-05)' })
  @ApiOkResponse({ type: FavoritesDto })
  favorites(@CurrentUser() user: AuthenticatedUser): never {
    return this.users.listFavorites(user.id);
  }

  @Post('favorites/:seriesId')
  @ApiOperation({ summary: 'Ajouter une série à « Ma liste » (planifié S05-BE-05)' })
  @ApiParam({ name: 'seriesId', format: 'uuid' })
  @ApiCreatedResponse({ type: FavoriteDto })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'SERIES_NOT_FOUND' })
  addFavorite(
    @Param('seriesId', ParseUUIDPipe) seriesId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): never {
    return this.users.addFavorite(user.id, seriesId);
  }

  @Delete('favorites/:seriesId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Retirer une série de « Ma liste » (planifié S05-BE-05)' })
  @ApiParam({ name: 'seriesId', format: 'uuid' })
  @ApiNoContentResponse()
  removeFavorite(
    @Param('seriesId', ParseUUIDPipe) seriesId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): never {
    return this.users.removeFavorite(user.id, seriesId);
  }
}
