import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller.js';
import { CatalogService } from './catalog.service.js';
import { EntitlementService } from './entitlement.service.js';
import { HomeService } from './home.service.js';
import { PersonalizationService } from './personalization.service.js';
import { SearchService } from './search.service.js';

@Module({
  controllers: [CatalogController],
  providers: [
    CatalogService,
    HomeService,
    EntitlementService,
    PersonalizationService,
    SearchService,
  ],
  exports: [CatalogService, HomeService, EntitlementService, PersonalizationService],
})
export class CatalogModule {}
