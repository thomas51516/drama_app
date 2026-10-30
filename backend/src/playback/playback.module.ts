import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module.js';
import { UnlockModule } from '../unlock/unlock.module.js';
import { PlaybackController } from './playback.controller.js';
import { PlaybackService } from './playback.service.js';

@Module({
  imports: [CatalogModule, UnlockModule],
  controllers: [PlaybackController],
  providers: [PlaybackService],
})
export class PlaybackModule {}
