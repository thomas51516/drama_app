import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { AppConfig } from '../../config/app-config.js';
import { type Episode } from '../../generated/prisma/client.js';
import { bullConnectionFromUrl } from '../redis-connection.js';
import {
  TRANSCODE_QUEUE,
  type TranscodeJobData,
  type TranscodeProvider,
  type TranscodeSubmission,
} from '../transcode.types.js';

/** Identifiant de job unique par soumission. BullMQ interdit « : » dans un jobId personnalisé. */
export function transcodeJobId(episodeId: string, now = Date.now()): string {
  return `${episodeId}-${now}`;
}

/** Adaptateur de dev : file BullMQ `transcode` consommée par `TranscodeWorker` (ffmpeg local). */
@Injectable()
export class LocalTranscodeProvider implements TranscodeProvider, OnModuleDestroy {
  readonly name = 'local' as const;
  private readonly logger = new Logger(LocalTranscodeProvider.name);
  readonly queue: Queue<TranscodeJobData>;

  constructor(config: AppConfig) {
    this.queue = new Queue<TranscodeJobData>(TRANSCODE_QUEUE, {
      connection: bullConnectionFromUrl(config.redisUrl),
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 500 },
      },
    });
    this.queue.on('error', (err) => this.logger.warn(`Queue error: ${err.message}`));
  }

  async submit(episode: Episode): Promise<TranscodeSubmission> {
    if (!episode.sourceKey) throw new Error('Episode has no sourceKey');
    const job = await this.queue.add(
      'transcode',
      { episodeId: episode.id, sourceKey: episode.sourceKey },
      { jobId: transcodeJobId(episode.id) },
    );
    return { externalId: job.id, status: 'UPLOADED' };
  }

  async onModuleDestroy(): Promise<void> {
    // Attendre la connexion avant de fermer : évite un rejet non géré d'ioredis si l'arrêt
    // survient pendant l'établissement de la connexion (tests, démarrage avorté).
    await this.queue.waitUntilReady().catch(() => undefined);
    await this.queue.close().catch((err: Error) => this.logger.warn(`Queue close: ${err.message}`));
  }
}
