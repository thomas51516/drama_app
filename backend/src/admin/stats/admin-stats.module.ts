import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../auth/admin-auth.module.js';
import { AdminStatsController } from './admin-stats.controller.js';
import { AdminStatsService } from './admin-stats.service.js';

@Module({
  imports: [AdminAuthModule],
  controllers: [AdminStatsController],
  providers: [AdminStatsService],
})
export class AdminStatsModule {}
