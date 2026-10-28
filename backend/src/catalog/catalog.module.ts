import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller.js';
import { CatalogService } from './catalog.service.js';
import { EntitlementService } from './entitlement.service.js';

@Module({
  controllers: [CatalogController],
  providers: [CatalogService, EntitlementService],
  exports: [CatalogService, EntitlementService],
})
export class CatalogModule {}
