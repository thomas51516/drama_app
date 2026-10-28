import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { type AuthenticatedUser } from '../common/request-context.js';
import { UsersService } from './users.service.js';

@ApiExcludeController()
@Controller('me')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  // TODO S05-BE-04
  @Get()
  me(@CurrentUser() user: AuthenticatedUser): never {
    return this.users.getMe(user.id);
  }

  @Patch()
  update(@Body() patch: unknown, @CurrentUser() user: AuthenticatedUser): never {
    return this.users.updateMe(user.id, patch);
  }

  @Delete()
  remove(@CurrentUser() user: AuthenticatedUser): never {
    return this.users.deleteMe(user.id);
  }

  // TODO S05-BE-05
  @Get('favorites')
  favorites(@CurrentUser() user: AuthenticatedUser): never {
    return this.users.listFavorites(user.id);
  }

  @Post('favorites/:seriesId')
  addFavorite(
    @Param('seriesId', ParseUUIDPipe) seriesId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): never {
    return this.users.addFavorite(user.id, seriesId);
  }

  @Delete('favorites/:seriesId')
  removeFavorite(
    @Param('seriesId', ParseUUIDPipe) seriesId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): never {
    return this.users.removeFavorite(user.id, seriesId);
  }
}
