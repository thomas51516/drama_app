import { type Episode } from '../../generated/prisma/client.js';
import { MetricsService } from '../../metrics/metrics.service.js';
import { TranscodeMetrics } from '../transcode.metrics.js';
import { fitFilter, ladderArgs, previewArgs, RENDITIONS, thumbnailArgs } from './hls-ladder.js';
import { TranscodePipeline } from './transcode.pipeline.js';

const EPISODE_ID = '0192f1f0-8a5b-7c3d-9e1f-0000000000e1';
const SOURCE_KEY = 'sources/s/e/ep1.mp4';

function episode(): Episode {
  return {
    id: EPISODE_ID,
    seriesId: 's',
    number: 1,
    title: null,
    durationSeconds: 0,
    transcodeStatus: 'UPLOADED',
    sourceKey: SOURCE_KEY,
    hlsKey: null,
    thumbnailUrl: null,
    previewKey: null,
    transcodeError: null,
    transcodeExternalId: null,
    publishedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makePipeline(
  opts: { probeFails?: boolean; ffmpegFails?: boolean; hasAudio?: boolean } = {},
) {
  const prisma = { episode: { findUnique: vi.fn(() => Promise.resolve(episode())) } };
  const storage = {
    downloadToFile: vi.fn(() => Promise.resolve()),
    deletePrefix: vi.fn(() => Promise.resolve(0)),
    uploadDirectory: vi.fn(() => Promise.resolve(42)),
    publicUrl: (key: string) => `http://cdn/${key}`,
  };
  const ffmpeg = {
    probe: vi.fn(() =>
      opts.probeFails
        ? Promise.reject(new Error('ffprobe exited with code 1: Invalid data'))
        : Promise.resolve({
            durationSeconds: 12.4,
            hasAudio: opts.hasAudio ?? true,
            width: 1080,
            height: 1920,
          }),
    ),
    run: vi.fn((args: string[]) =>
      opts.ffmpegFails && args.includes('master.m3u8')
        ? Promise.reject(new Error('ffmpeg exited with code 1: boom'))
        : Promise.resolve(),
    ),
  };
  const transcode = {
    markProcessing: vi.fn(() => Promise.resolve()),
    markReady: vi.fn(() => Promise.resolve(episode())),
    markFailed: vi.fn(() => Promise.resolve(episode())),
  };
  const metrics = new TranscodeMetrics(new MetricsService());
  const pipeline = new TranscodePipeline(
    prisma as never,
    storage as never,
    ffmpeg as never,
    transcode as never,
    metrics,
  );
  return { pipeline, prisma, storage, ffmpeg, transcode };
}

describe('TranscodePipeline.run (ffmpeg mocked)', () => {
  it('downloads, probes, renders ladder + preview + thumbnail, uploads under hls/{id}/ and marks READY', async () => {
    const { pipeline, storage, ffmpeg, transcode } = makePipeline();
    await pipeline.run({ episodeId: EPISODE_ID, sourceKey: SOURCE_KEY });

    expect(transcode.markProcessing).toHaveBeenCalledWith(EPISODE_ID);
    expect(storage.downloadToFile).toHaveBeenCalledWith(
      SOURCE_KEY,
      expect.stringMatching(/source\.mp4$/),
    );
    expect(ffmpeg.run).toHaveBeenCalledTimes(3);
    const [ladder, preview, thumb] = ffmpeg.run.mock.calls.map((c) => c[0]);
    expect(ladder).toContain('master.m3u8');
    expect(ladder?.join(' ')).toContain('name:1080p');
    expect(preview?.join(' ')).toContain('preview/index.m3u8');
    expect(thumb?.join(' ')).toContain('thumbnail.jpg');
    expect(storage.deletePrefix).toHaveBeenCalledWith(`hls/${EPISODE_ID}/`);
    expect(storage.uploadDirectory).toHaveBeenCalledWith(
      `hls/${EPISODE_ID}`,
      expect.stringMatching(/out$/),
    );
    expect(transcode.markReady).toHaveBeenCalledWith(
      expect.objectContaining({ id: EPISODE_ID }),
      {
        hlsKey: `hls/${EPISODE_ID}/master.m3u8`,
        previewKey: `hls/${EPISODE_ID}/preview/index.m3u8`,
        thumbnailUrl: `http://cdn/hls/${EPISODE_ID}/thumbnail.jpg`,
        durationSeconds: 12,
      },
      'local',
    );
    expect(transcode.markFailed).not.toHaveBeenCalled();
  });

  it('marks FAILED with the ffmpeg error message when a render fails', async () => {
    const { pipeline, transcode, storage } = makePipeline({ ffmpegFails: true });
    await pipeline.run({ episodeId: EPISODE_ID, sourceKey: SOURCE_KEY });
    expect(transcode.markFailed).toHaveBeenCalledWith(
      expect.objectContaining({ id: EPISODE_ID }),
      expect.stringContaining('ffmpeg exited with code 1'),
      'local',
    );
    expect(storage.uploadDirectory).not.toHaveBeenCalled();
    expect(transcode.markReady).not.toHaveBeenCalled();
  });

  it('marks FAILED when the source cannot be probed', async () => {
    const { pipeline, transcode } = makePipeline({ probeFails: true });
    await pipeline.run({ episodeId: EPISODE_ID, sourceKey: SOURCE_KEY });
    expect(transcode.markFailed).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('ffprobe'),
      'local',
    );
  });

  it('skips a stale job whose source key was replaced', async () => {
    const { pipeline, transcode, ffmpeg } = makePipeline();
    await pipeline.run({ episodeId: EPISODE_ID, sourceKey: 'sources/other.mp4' });
    expect(ffmpeg.run).not.toHaveBeenCalled();
    expect(transcode.markProcessing).not.toHaveBeenCalled();
  });
});

describe('hls-ladder', () => {
  it('keeps 9:16 with force_original_aspect_ratio=decrease + pad for every rendition', () => {
    expect(RENDITIONS.map((r) => r.name)).toEqual(['360p', '540p', '720p', '1080p']);
    expect(fitFilter(540, 960)).toBe(
      'scale=w=540:h=960:force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos,pad=540:960:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1',
    );
    const args = ladderArgs('/tmp/src.mp4', '/tmp/out', true);
    const joined = args.join(' ');
    expect(joined).toContain('-hls_time 2');
    expect(joined).toContain('-hls_segment_type fmp4');
    expect(joined).toContain('-master_pl_name master.m3u8');
    expect(joined).toContain(
      'v:0,a:0,name:360p v:1,a:1,name:540p v:2,a:2,name:720p v:3,a:3,name:1080p',
    );
    expect(joined).toContain('-b:v:3 4000k');
    expect(args.filter((a) => a === '-map')).toHaveLength(8);
  });

  it('adds a silent audio track when the source has none', () => {
    const args = ladderArgs('/tmp/src.mp4', '/tmp/out', false).join(' ');
    expect(args).toContain('anullsrc');
    expect(args).toContain('1:a:0');
    expect(args).toContain('-shortest');
    expect(previewArgs('/tmp/src.mp4', '/tmp/out', false).join(' ')).toContain('-t 15');
  });

  it('takes the thumbnail at 2 s, or mid-way for very short sources', () => {
    expect(thumbnailArgs('/s', '/o', 30).slice(0, 2)).toEqual(['-ss', '2.00']);
    expect(thumbnailArgs('/s', '/o', 1).slice(0, 2)).toEqual(['-ss', '0.50']);
  });
});
