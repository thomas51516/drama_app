import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../auth/admin-auth.module.js';
import { AdminRightsController } from './admin-rights.controller.js';
import { AdminRightsService } from './admin-rights.service.js';

/** Droits et contrats (B-12, S09-BE). */
@Module({
  imports: [AdminAuthModule],
  controllers: [AdminRightsController],
  providers: [AdminRightsService],
  exports: [AdminRightsService],
})
export class AdminRightsModule {}
