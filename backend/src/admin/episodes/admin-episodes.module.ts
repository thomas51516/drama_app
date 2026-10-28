import { Module } from '@nestjs/common';
import { TranscodeModule } from '../../transcode/transcode.module.js';
import { AdminAuthModule } from '../auth/admin-auth.module.js';
import { AdminEpisodesController } from './admin-episodes.controller.js';
import { AdminEpisodesService } from './admin-episodes.service.js';

@Module({
  imports: [AdminAuthModule, TranscodeModule],
  controllers: [AdminEpisodesController],
  providers: [AdminEpisodesService],
  exports: [AdminEpisodesService],
})
export class AdminEpisodesModule {}
