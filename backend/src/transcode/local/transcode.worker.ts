import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Worker } from 'bullmq';
import { AppConfig } from '../../config/app-config.js';
import { TRANSCODE_QUEUE, type TranscodeJobData } from '../transcode.types.js';
import { bullConnectionFromUrl } from '../redis-connection.js';
import { TranscodePipeline } from './transcode.pipeline.js';

/**
 * Worker BullMQ hébergé dans le processus API en dev (TRANSCODE_PROVIDER=local).
 * En staging/prod : même code lancé dans un processus dédié (TRANSCODE_WORKER_ENABLED=false côté API).
 */
@Injectable()
export class TranscodeWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TranscodeWorker.name);
  private worker?: Worker<TranscodeJobData>;

  constructor(
    private readonly config: AppConfig,
    private readonly pipeline: TranscodePipeline,
  ) {}

  onModuleInit(): void {
    const { provider, workerEnabled, concurrency } = this.config.transcode;
    if (provider !== 'local' || !workerEnabled) return;
    this.worker = new Worker<TranscodeJobData>(
      TRANSCODE_QUEUE,
      async (job) => {
        this.logger.log(`Job ${job.id}: transcoding episode ${job.data.episodeId}`);
        await this.pipeline.run(job.data);
      },
      {
        connection: bullConnectionFromUrl(this.config.redisUrl),
        concurrency,
        lockDuration: 10 * 60_000,
        stalledInterval: 60_000,
      },
    );
    this.worker.on('error', (err) => this.logger.warn(`Worker error: ${err.message}`));
    this.worker.on('failed', (job, err) =>
      this.logger.error(`Job ${job?.id ?? '?'} failed: ${err.message}`),
    );
    this.logger.log(`Transcode worker started (concurrency ${concurrency})`);
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.worker) return;
    await this.worker.waitUntilReady().catch(() => undefined);
    await this.worker
      .close()
      .catch((err: Error) => this.logger.warn(`Worker close: ${err.message}`));
  }
}
