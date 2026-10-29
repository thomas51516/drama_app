import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../auth/admin-auth.module.js';
import { AdminSubtitlesController } from './admin-subtitles.controller.js';
import { AdminSubtitlesService } from './admin-subtitles.service.js';

@Module({
  imports: [AdminAuthModule],
  controllers: [AdminSubtitlesController],
  providers: [AdminSubtitlesService],
  exports: [AdminSubtitlesService],
})
export class AdminSubtitlesModule {}
