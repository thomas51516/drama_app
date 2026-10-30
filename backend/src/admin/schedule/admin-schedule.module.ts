import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../auth/admin-auth.module.js';
import { AdminScheduleController } from './admin-schedule.controller.js';
import { AdminScheduleService } from './admin-schedule.service.js';

@Module({
  imports: [AdminAuthModule],
  controllers: [AdminScheduleController],
  providers: [AdminScheduleService],
})
export class AdminScheduleModule {}
