import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { AppConfig } from '../config/app-config.js';
import { MetricsService } from '../metrics/metrics.service.js';
import { bullConnectionFromUrl } from '../transcode/redis-connection.js';
import { CampaignSenderService } from './campaign-sender.service.js';
import { PUSH_QUEUE, type CampaignJobData } from './push.types.js';

/**
 * File BullMQ `push` (B-10) : l'envoi d'une campagne est un job traité par lots hors du cycle de
 * la requête. `PUSH_QUEUE_ENABLED=false` (tests, export OpenAPI) : envoi en ligne, aucune connexion.
 */
@Injectable()
export class PushQueue implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PushQueue.name);
  private queue?: Queue<CampaignJobData>;
  private worker?: Worker<CampaignJobData>;

  constructor(
    private readonly config: AppConfig,
    private readonly sender: CampaignSenderService,
    private readonly metrics: MetricsService,
  ) {}

  get enabled(): boolean {
    return this.config.push.queueEnabled;
  }

  onModuleInit(): void {
    if (!this.enabled) return;
    const connection = bullConnectionFromUrl(this.config.redisUrl);
    this.queue = new Queue<CampaignJobData>(PUSH_QUEUE, {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 500 },
      },
    });
    this.queue.on('error', (err) => this.logger.warn(`Queue error: ${err.message}`));
    this.metrics.registerQueue(PUSH_QUEUE, this.queue);
    this.worker = new Worker<CampaignJobData>(
      PUSH_QUEUE,
      async (job) => {
        this.logger.log(`Job ${job.id}: sending campaign ${job.data.campaignId}`);
        await this.sender.run(job.data.campaignId);
      },
      { connection: bullConnectionFromUrl(this.config.redisUrl), concurrency: 1 },
    );
    this.worker.on('error', (err) => this.logger.warn(`Worker error: ${err.message}`));
    this.worker.on('failed', (job, err) =>
      this.logger.error(`Job ${job?.id ?? '?'} failed: ${err.message}`),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close().catch(() => undefined);
    if (this.queue) {
      await this.queue.waitUntilReady().catch(() => undefined);
      await this.queue.close().catch(() => undefined);
    }
  }

  /** Met la campagne en file, ou l'envoie immédiatement si la file est désactivée. */
  async dispatch(campaignId: string): Promise<void> {
    if (this.queue) {
      await this.queue.add(
        'campaign',
        { campaignId },
        { jobId: `campaign-${campaignId}-${Date.now()}` },
      );
      return;
    }
    await this.sender.run(campaignId);
  }
}
