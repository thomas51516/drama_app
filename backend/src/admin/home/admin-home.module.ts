import { Module } from '@nestjs/common';
import { CatalogModule } from '../../catalog/catalog.module.js';
import { AdminAuthModule } from '../auth/admin-auth.module.js';
import { AdminHomeController } from './admin-home.controller.js';
import { AdminHomeService } from './admin-home.service.js';

@Module({
  imports: [AdminAuthModule, CatalogModule],
  controllers: [AdminHomeController],
  providers: [AdminHomeService],
  exports: [AdminHomeService],
})
export class AdminHomeModule {}
