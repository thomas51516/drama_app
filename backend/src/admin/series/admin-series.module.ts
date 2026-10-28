import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../auth/admin-auth.module.js';
import { AdminSeriesController } from './admin-series.controller.js';
import { AdminSeriesService } from './admin-series.service.js';

@Module({
  imports: [AdminAuthModule],
  controllers: [AdminSeriesController],
  providers: [AdminSeriesService],
  exports: [AdminSeriesService],
})
export class AdminSeriesModule {}
