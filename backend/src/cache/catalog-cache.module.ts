import { Global, Module } from '@nestjs/common';
import { CatalogCacheService } from './catalog-cache.service.js';

/** Cache du catalogue public (S04-BE-04), global : invalidé depuis l'admin et le transcodage. */
@Global()
@Module({ providers: [CatalogCacheService], exports: [CatalogCacheService] })
export class CatalogCacheModule {}
