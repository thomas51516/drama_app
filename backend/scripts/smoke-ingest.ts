/**
 * Test d'ingestion de bout en bout sur une API en marche (S02-BE-04 + S02-BE-05, mode local) :
 * génère un mp4 vertical 1080x1920 de 5 s (ffmpeg testsrc2), connexion admin 2FA, création d'une
 * série + épisode, URL pré-signée, PUT direct vers MinIO, /uploaded, attente du worker, vérification
 * READY puis téléchargement du master.m3u8 depuis le CDN (MinIO).
 *
 * Usage : npx tsx scripts/smoke-ingest.ts [http://localhost:3000]
 * Variables : SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD (compte seed), SMOKE_KEEP=1 pour conserver la série.
 */
import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { totpCode } from '../src/common/crypto/totp.js';
import { SecretBox } from '../src/common/crypto/secret-box.js';
import { PrismaClient } from '../src/generated/prisma/client.js';

const api = (process.argv[2] ?? `http://localhost:${process.env.PORT ?? '3000'}`).replace(
  /\/+$/,
  '',
);
const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@drama.local';
const password = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe!2026';

async function call<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  const res = await fetch(`${api}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text}`);
  return (text ? JSON.parse(text) : undefined) as T;
}

const sample = join(tmpdir(), 'drama-smoke-1080x1920.mp4');
execFileSync(process.env.FFMPEG_PATH ?? 'ffmpeg', [
  '-hide_banner',
  '-loglevel',
  'error',
  '-y',
  '-f',
  'lavfi',
  '-i',
  'testsrc2=size=1080x1920:rate=24',
  '-f',
  'lavfi',
  '-i',
  'sine=frequency=440:sample_rate=48000',
  '-t',
  '5',
  '-c:v',
  'libx264',
  '-preset',
  'veryfast',
  '-pix_fmt',
  'yuv420p',
  '-c:a',
  'aac',
  '-shortest',
  sample,
]);
console.log(`1. sample generated: ${sample} (${statSync(sample).size} bytes)`);

// Connexion 2FA : premier login = enrôlement (secret renvoyé) ; sinon le secret est relu (chiffré) en base.
const login = await call<{ status: string; challengeToken: string; secret?: string }>(
  'POST',
  '/admin/auth/login',
  { email, password },
);
let secret = login.secret;
if (!secret) {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });
  const account = await prisma.adminAccount.findUniqueOrThrow({ where: { email } });
  await prisma.$disconnect();
  secret = new SecretBox(process.env.TOTP_ENCRYPTION_KEY!).open(account.totpSecret!);
}
const session = await call<{ accessToken: string; user: { role: string } }>(
  'POST',
  '/admin/auth/totp/verify',
  { challengeToken: login.challengeToken, code: totpCode(secret) },
);
const token = session.accessToken;
console.log(`2. admin session (${login.status}, role ${session.user.role})`);

const series = await call<{ id: string; slug: string }>(
  'POST',
  '/admin/series',
  { title: `Smoke ingest ${new Date().toISOString()}`, genres: ['test'] },
  token,
);
const episode = await call<{ id: string; number: number }>(
  'POST',
  `/admin/series/${series.id}/episodes`,
  { title: 'Smoke' },
  token,
);
console.log(`3. series ${series.slug} / episode #${episode.number} ${episode.id}`);

const target = await call<{
  uploadUrl: string;
  headers: Record<string, string>;
  sourceKey: string;
}>(
  'POST',
  `/admin/episodes/${episode.id}/upload-url`,
  { fileName: 'smoke-1080x1920.mp4', contentType: 'video/mp4', sizeBytes: statSync(sample).size },
  token,
);
const put = await fetch(target.uploadUrl, {
  method: 'PUT',
  headers: target.headers,
  body: readFileSync(sample),
});
if (!put.ok) throw new Error(`PUT upload failed: ${put.status} ${await put.text()}`);
console.log(`4. PUT ${target.sourceKey} -> ${put.status}`);

const queued = await call<{ transcodeStatus: string }>(
  'POST',
  `/admin/episodes/${episode.id}/uploaded`,
  undefined,
  token,
);
console.log(`5. /uploaded -> ${queued.transcodeStatus}`);

const startedAt = Date.now();
let final:
  | {
      transcodeStatus: string;
      hlsKey: string | null;
      durationSeconds: number;
      transcodeError: string | null;
      thumbnailUrl: string | null;
    }
  | undefined;
while (Date.now() - startedAt < 5 * 60_000) {
  const list = await call<Array<typeof final & { id: string }>>(
    'GET',
    `/admin/series/${series.id}/episodes`,
    undefined,
    token,
  );
  final = list.find((e) => e.id === episode.id);
  if (final && (final.transcodeStatus === 'READY' || final.transcodeStatus === 'FAILED')) break;
  process.stdout.write(
    `   ... ${final?.transcodeStatus} (${Math.round((Date.now() - startedAt) / 1000)}s)\r`,
  );
  await new Promise((r) => setTimeout(r, 2000));
}
console.log(
  `\n6. final status: ${final?.transcodeStatus} after ${Math.round((Date.now() - startedAt) / 1000)}s`,
);
if (final?.transcodeStatus !== 'READY')
  throw new Error(`Transcode did not succeed: ${final?.transcodeError ?? 'timeout'}`);

const cdn = (process.env.CDN_BASE_URL ?? 'http://localhost:9000/drama-media').replace(/\/+$/, '');
const manifest = await fetch(`${cdn}/${final.hlsKey}`);
const text = await manifest.text();
if (!manifest.ok || !text.includes('#EXT-X-STREAM-INF'))
  throw new Error(`Manifest not fetchable: ${manifest.status}`);
const renditions = [...text.matchAll(/RESOLUTION=(\d+x\d+)/g)].map((m) => m[1]);
const thumb = await fetch(final.thumbnailUrl!);
console.log(
  `7. ${cdn}/${final.hlsKey} -> ${manifest.status}, renditions ${renditions.join(' ')}, duration ${final.durationSeconds}s, thumbnail ${thumb.status}`,
);
const preview = await fetch(`${cdn}/hls/${episode.id}/preview/index.m3u8`);
console.log(`   preview playlist -> ${preview.status}`);

if (!process.env.SMOKE_KEEP) {
  await call('DELETE', `/admin/episodes/${episode.id}`, undefined, token);
  // Pas de suppression de série dans le contrat admin : nettoyage direct en base.
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });
  await prisma.series.delete({ where: { id: series.id } });
  await prisma.$disconnect();
  console.log('8. cleanup: episode deleted via API (HLS + source objects removed), series removed');
}
console.log('SMOKE INGEST OK');
