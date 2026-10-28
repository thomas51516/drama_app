import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { type Episode } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { StorageService } from '../../storage/storage.service.js';
import { TranscodeMetrics } from '../transcode.metrics.js';
import { TranscodeService } from '../transcode.service.js';
import { type TranscodeJobData } from '../transcode.types.js';
import { FfmpegRunner } from './ffmpeg.runner.js';
import { ladderArgs, previewArgs, RENDITIONS, thumbnailArgs } from './hls-ladder.js';

export const hlsPrefix = (episodeId: string): string => `hls/${episodeId}`;

/**
 * Pipeline ffmpeg local (S02-BE-05, §9) : source S3 → dossier temporaire → rendus HLS CMAF
 * 360p/540p/720p/1080p (segments 2 s, master.m3u8) + extrait 15 s + vignette → `hls/{episodeId}/`.
 */
@Injectable()
export class TranscodePipeline {
  private readonly logger = new Logger(TranscodePipeline.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly ffmpeg: FfmpegRunner,
    private readonly transcode: TranscodeService,
    private readonly metrics: TranscodeMetrics,
  ) {}

  async run(job: TranscodeJobData): Promise<void> {
    const episode = await this.prisma.episode.findUnique({ where: { id: job.episodeId } });
    if (!episode) {
      this.logger.warn(`Episode ${job.episodeId} vanished before transcoding`);
      return;
    }
    if (episode.sourceKey !== job.sourceKey) {
      this.logger.warn(`Episode ${episode.id}: stale job (source replaced), skipping`);
      return;
    }

    const stop = this.metrics.jobDuration.startTimer({ provider: 'local' });
    this.metrics.activeJobs.inc();
    const workDir = await mkdtemp(join(tmpdir(), 'drama-transcode-'));
    try {
      await this.transcode.markProcessing(episode.id);
      const result = await this.render(episode, job.sourceKey, workDir);
      await this.transcode.markReady(episode, result, 'local');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.transcode.markFailed(episode, message, 'local');
    } finally {
      this.metrics.activeJobs.dec();
      stop();
      await rm(workDir, { recursive: true, force: true });
    }
  }

  private async render(episode: Episode, sourceKey: string, workDir: string) {
    const source = join(workDir, `source${extname(sourceKey) || '.mp4'}`);
    const outDir = join(workDir, 'out');
    await this.storage.downloadToFile(sourceKey, source);

    const probe = await this.ffmpeg.probe(source);
    if (probe.durationSeconds <= 0) throw new Error('Source has no readable duration');
    if (probe.width && probe.height && probe.width > probe.height) {
      this.logger.warn(
        `Episode ${episode.id}: landscape source ${probe.width}x${probe.height}, padding to 9:16`,
      );
    }

    await Promise.all(
      [...RENDITIONS.map((r) => r.name), 'preview'].map((d) =>
        mkdir(join(outDir, d), { recursive: true }),
      ),
    );
    await this.ffmpeg.run(ladderArgs(source, outDir, probe.hasAudio));
    await this.ffmpeg.run(previewArgs(source, outDir, probe.hasAudio));
    await this.ffmpeg.run(thumbnailArgs(source, outDir, probe.durationSeconds));

    const prefix = hlsPrefix(episode.id);
    await this.storage.deletePrefix(`${prefix}/`);
    const uploaded = await this.storage.uploadDirectory(prefix, outDir);
    this.logger.log(`Episode ${episode.id}: ${uploaded} HLS object(s) uploaded under ${prefix}/`);

    return {
      hlsKey: `${prefix}/master.m3u8`,
      previewKey: `${prefix}/preview/index.m3u8`,
      thumbnailUrl: this.storage.publicUrl(`${prefix}/thumbnail.jpg`),
      durationSeconds: Math.round(probe.durationSeconds),
    };
  }
}
