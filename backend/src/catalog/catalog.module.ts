import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller.js';
import { CatalogService } from './catalog.service.js';
import { EntitlementService } from './entitlement.service.js';
import { HomeService } from './home.service.js';

@Module({
  controllers: [CatalogController],
  providers: [CatalogService, HomeService, EntitlementService],
  exports: [CatalogService, HomeService, EntitlementService],
})
export class CatalogModule {}
