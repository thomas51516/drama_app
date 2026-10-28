import { posix } from 'node:path';

/** Échelle de rendus identique à infra/media-samples/generate.sh (HLS CMAF, 9:16). */
export interface Rendition {
  name: string;
  width: number;
  height: number;
  videoBitrate: string;
  audioBitrate: string;
}

export const RENDITIONS: readonly Rendition[] = [
  { name: '360p', width: 360, height: 640, videoBitrate: '600k', audioBitrate: '64k' },
  { name: '540p', width: 540, height: 960, videoBitrate: '1200k', audioBitrate: '96k' },
  { name: '720p', width: 720, height: 1280, videoBitrate: '2200k', audioBitrate: '96k' },
  { name: '1080p', width: 1080, height: 1920, videoBitrate: '4000k', audioBitrate: '128k' },
];

export const SEGMENT_SECONDS = 2;
export const PREVIEW_SECONDS = 15;
const ANULLSRC = 'anullsrc=channel_layout=stereo:sample_rate=48000';

/** Mise à l'échelle sans déformation puis remplissage noir pour garantir le 9:16 attendu. */
export function fitFilter(width: number, height: number): string {
  return [
    `scale=w=${width}:h=${height}:force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos`,
    `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`,
    'setsar=1',
  ].join(',');
}

const keyframeArgs = [
  '-force_key_frames',
  `expr:gte(t,n_forced*${SEGMENT_SECONDS})`,
  '-sc_threshold',
  '0',
];

/** Rendus multi-débits + master.m3u8 en une seule passe ffmpeg. */
export function ladderArgs(source: string, outDir: string, hasAudio: boolean): string[] {
  const audioInput = hasAudio ? [] : ['-f', 'lavfi', '-i', ANULLSRC];
  const audioMap = hasAudio ? '0:a:0' : '1:a:0';
  const split = RENDITIONS.map((_, i) => `[v${i}]`).join('');
  const scaled = RENDITIONS.map((r, i) => `[v${i}]${fitFilter(r.width, r.height)}[s${i}]`).join(
    ';',
  );
  const filter = `[0:v]split=${RENDITIONS.length}${split};${scaled}`;
  const maps = RENDITIONS.flatMap((_, i) => ['-map', `[s${i}]`, '-map', audioMap]);
  const bitrates = RENDITIONS.flatMap((r, i) => [
    `-b:v:${i}`,
    r.videoBitrate,
    `-maxrate:v:${i}`,
    r.videoBitrate,
    `-bufsize:v:${i}`,
    r.videoBitrate,
    `-b:a:${i}`,
    r.audioBitrate,
  ]);
  const varStreamMap = RENDITIONS.map((r, i) => `v:${i},a:${i},name:${r.name}`).join(' ');
  return [
    '-i',
    source,
    ...audioInput,
    '-filter_complex',
    filter,
    ...maps,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-profile:v',
    'high',
    '-pix_fmt',
    'yuv420p',
    ...keyframeArgs,
    '-c:a',
    'aac',
    '-ac',
    '2',
    ...bitrates,
    ...(hasAudio ? [] : ['-shortest']),
    '-f',
    'hls',
    '-hls_time',
    String(SEGMENT_SECONDS),
    '-hls_playlist_type',
    'vod',
    '-hls_segment_type',
    'fmp4',
    '-hls_flags',
    'independent_segments',
    '-master_pl_name',
    'master.m3u8',
    '-var_stream_map',
    varStreamMap,
    '-hls_segment_filename',
    posix.join(outDir, '%v', 'seg_%03d.m4s'),
    posix.join(outDir, '%v', 'index.m3u8'),
  ];
}

/** Extrait de 15 s en 540p pour le flux « Pour vous » (M-02). */
export function previewArgs(source: string, outDir: string, hasAudio: boolean): string[] {
  const audioInput = hasAudio ? [] : ['-f', 'lavfi', '-i', ANULLSRC];
  return [
    '-i',
    source,
    ...audioInput,
    '-t',
    String(PREVIEW_SECONDS),
    '-map',
    '0:v:0',
    '-map',
    hasAudio ? '0:a:0' : '1:a:0',
    '-vf',
    fitFilter(540, 960),
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-b:v',
    '1200k',
    '-pix_fmt',
    'yuv420p',
    ...keyframeArgs,
    '-c:a',
    'aac',
    '-b:a',
    '96k',
    ...(hasAudio ? [] : ['-shortest']),
    '-f',
    'hls',
    '-hls_time',
    String(SEGMENT_SECONDS),
    '-hls_playlist_type',
    'vod',
    '-hls_segment_type',
    'fmp4',
    '-hls_segment_filename',
    posix.join(outDir, 'preview', 'seg_%03d.m4s'),
    posix.join(outDir, 'preview', 'index.m3u8'),
  ];
}

/** Vignette 540x960 prise à 2 s (ou au milieu d'une source plus courte). */
export function thumbnailArgs(source: string, outDir: string, durationSeconds: number): string[] {
  const at = durationSeconds >= 4 ? 2 : Math.max(0, durationSeconds / 2);
  return [
    '-ss',
    at.toFixed(2),
    '-i',
    source,
    '-frames:v',
    '1',
    '-vf',
    fitFilter(540, 960),
    '-q:v',
    '3',
    posix.join(outDir, 'thumbnail.jpg'),
  ];
}
