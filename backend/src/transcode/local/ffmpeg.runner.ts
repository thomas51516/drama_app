import { spawn } from 'node:child_process';
import { Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../../config/app-config.js';

export interface ProbeResult {
  durationSeconds: number;
  hasAudio: boolean;
  width: number | null;
  height: number | null;
}

/** Exécution de ffmpeg / ffprobe (isolée pour être simulée dans les tests du worker). */
@Injectable()
export class FfmpegRunner {
  private readonly logger = new Logger(FfmpegRunner.name);

  constructor(private readonly config: AppConfig) {}

  run(args: string[]): Promise<void> {
    return this.exec(this.config.transcode.ffmpegPath, [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      ...args,
    ]).then(() => undefined);
  }

  async probe(filePath: string): Promise<ProbeResult> {
    const out = await this.exec(this.config.transcode.ffprobePath, [
      '-v',
      'error',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      filePath,
    ]);
    const parsed = JSON.parse(out) as {
      format?: { duration?: string };
      streams?: Array<{ codec_type?: string; width?: number; height?: number }>;
    };
    const video = parsed.streams?.find((s) => s.codec_type === 'video');
    return {
      durationSeconds: Number(parsed.format?.duration ?? 0) || 0,
      hasAudio: parsed.streams?.some((s) => s.codec_type === 'audio') ?? false,
      width: video?.width ?? null,
      height: video?.height ?? null,
    };
  }

  private exec(bin: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
      child.stderr.on('data', (d: Buffer) => {
        stderr = (stderr + d.toString()).slice(-4000);
      });
      child.on('error', (err) => reject(new Error(`${bin} not available: ${err.message}`)));
      child.on('close', (code) => {
        if (code === 0) resolve(stdout);
        else reject(new Error(`${bin} exited with code ${code}: ${stderr.trim()}`));
      });
      this.logger.debug(`${bin} ${args.join(' ')}`);
    });
  }
}
