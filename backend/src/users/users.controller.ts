import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { UserDto } from '../auth/dto/user.dto.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { ApiErrorDto } from '../common/dto/api-error.dto.js';
import { type AuthenticatedUser } from '../common/request-context.js';
import {
  DeleteMeResultDto,
  FavoritesPageDto,
  FavoritesQueryDto,
  UpdateMeDto,
} from './dto/users.dto.js';
import { FavoritesService } from './favorites.service.js';
import { UsersService } from './users.service.js';

/** Compte (S05-BE-04, M-52) et « Ma liste » (S05-BE-05, M-16). Jeton utilisateur obligatoire. */
@ApiTags('users')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'UNAUTHENTICATED | INVALID_TOKEN' })
@Controller('me')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly favorites: FavoritesService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Profil courant' })
  @ApiOkResponse({ type: UserDto })
  me(@CurrentUser() user: AuthenticatedUser): Promise<UserDto> {
    return this.users.getMe(user.id);
  }

  @Patch()
  @ApiOperation({
    summary: 'Modifier le profil',
    description:
      'Nom affiché, langue, pays, préférences de notification (fusionnées champ par champ), déblocage automatique.',
  })
  @ApiOkResponse({ type: UserDto })
  update(@Body() patch: UpdateMeDto, @CurrentUser() user: AuthenticatedUser): Promise<UserDto> {
    return this.users.updateMe(user.id, patch);
  }

  @Delete()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Demander la suppression du compte',
    description:
      'Suppression différée de 30 jours (§14) : le compte passe en DELETION_PENDING, ses jetons sont révoqués, puis une tâche planifiée l’anonymise (e-mail, téléphone, identités, favoris et progression effacés ; grand livre et achats conservés). Se reconnecter puis appeler `POST /me/delete/cancel` annule la demande dans le délai.',
  })
  @ApiAcceptedResponse({ type: DeleteMeResultDto })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'USER_NOT_ACTIVE' })
  remove(@CurrentUser() user: AuthenticatedUser, @Ip() ip?: string): Promise<DeleteMeResultDto> {
    return this.users.deleteMe(user.id, ip);
  }

  @Post('delete/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Annuler la suppression du compte (dans le délai, après reconnexion)' })
  @ApiOkResponse({ type: UserDto })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'DELETION_NOT_PENDING' })
  cancelDeletion(@CurrentUser() user: AuthenticatedUser, @Ip() ip?: string): Promise<UserDto> {
    return this.users.cancelDeletion(user.id, ip);
  }

  @Get('favorites')
  @ApiOperation({ summary: '« Ma liste » (M-16), paginée, du plus récent au plus ancien' })
  @ApiOkResponse({ type: FavoritesPageDto })
  listFavorites(
    @Query() query: FavoritesQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<FavoritesPageDto> {
    return this.favorites.list(user.id, query);
  }

  @Put('favorites/:seriesId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Ajouter une série à « Ma liste » (idempotent)' })
  @ApiParam({ name: 'seriesId', format: 'uuid' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'SERIES_NOT_FOUND' })
  addFavorite(
    @Param('seriesId', ParseUUIDPipe) seriesId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.favorites.add(user.id, seriesId);
  }

  @Delete('favorites/:seriesId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Retirer une série de « Ma liste » (idempotent)' })
  @ApiParam({ name: 'seriesId', format: 'uuid' })
  @ApiNoContentResponse()
  removeFavorite(
    @Param('seriesId', ParseUUIDPipe) seriesId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.favorites.remove(user.id, seriesId);
  }
}
