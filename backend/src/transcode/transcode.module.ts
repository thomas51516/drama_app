import { Module } from '@nestjs/common';
import { AppConfig } from '../config/app-config.js';
import { MetricsService } from '../metrics/metrics.service.js';
import { StorageService } from '../storage/storage.service.js';
import { FfmpegRunner } from './local/ffmpeg.runner.js';
import { TranscodePipeline } from './local/transcode.pipeline.js';
import { TranscodeWorker } from './local/transcode.worker.js';
import { LocalTranscodeProvider } from './providers/local-transcode.provider.js';
import { WebhookTranscodeProvider } from './providers/webhook-transcode.provider.js';
import { TranscodeMetrics } from './transcode.metrics.js';
import { TranscodeService } from './transcode.service.js';
import { TRANSCODE_PROVIDER, TRANSCODE_QUEUE, type TranscodeProvider } from './transcode.types.js';
import { TranscodeWebhookController } from './webhook/transcode-webhook.controller.js';

/**
 * Pipeline vidéo (S02-BE-05). Le fournisseur est choisi par TRANSCODE_PROVIDER :
 * `local` = file BullMQ + worker ffmpeg dans ce processus ; `webhook` = service géré.
 */
@Module({
  controllers: [TranscodeWebhookController],
  providers: [
    TranscodeMetrics,
    TranscodeService,
    FfmpegRunner,
    TranscodePipeline,
    TranscodeWorker,
    {
      provide: TRANSCODE_PROVIDER,
      inject: [AppConfig, StorageService, MetricsService],
      useFactory: (
        config: AppConfig,
        storage: StorageService,
        metrics: MetricsService,
      ): TranscodeProvider => {
        if (config.transcode.provider === 'webhook') {
          return new WebhookTranscodeProvider(config, storage);
        }
        const local = new LocalTranscodeProvider(config);
        metrics.registerQueue(TRANSCODE_QUEUE, local.queue);
        return local;
      },
    },
  ],
  exports: [TranscodeService],
})
export class TranscodeModule {}
