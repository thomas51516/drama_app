import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module.js';
import { AccountDeletionService } from './account-deletion.service.js';
import { FavoritesService } from './favorites.service.js';
import { LikesController } from './likes.controller.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

/** Compte, suppression différée, favoris et « J'aime » (S05-BE-04, S05-BE-05). */
@Module({
  imports: [CatalogModule],
  controllers: [UsersController, LikesController],
  providers: [UsersService, FavoritesService, AccountDeletionService],
  exports: [UsersService, FavoritesService, AccountDeletionService],
})
export class UsersModule {}
