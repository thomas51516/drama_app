/**
 * Seed minimal de développement : `npm run db:seed` (ou automatiquement après `prisma migrate reset`).
 * Idempotent : tout est fait en upsert sur des clés stables.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import argon2 from 'argon2';
import { PrismaClient } from '../src/generated/prisma/client.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required to seed');

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

// Flux HLS publics de test (Mux / Apple), utilisés tant que le pipeline vidéo n'existe pas (S02-BE-05).
const TEST_STREAMS = [
  'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
  'https://test-streams.mux.dev/test_001/stream.m3u8',
  'https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_hls/master.m3u8',
];

async function main(): Promise<void> {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@drama.local';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe!2026';

  const admin = await prisma.adminAccount.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      displayName: 'Administrateur',
      role: 'ADMIN',
      passwordHash: await argon2.hash(adminPassword, { type: argon2.argon2id }),
    },
  });
  console.log(`admin account: ${admin.email} (${admin.role})`);

  const publishedAt = new Date('2026-10-01T08:00:00Z');
  const series = await prisma.series.upsert({
    where: { slug: 'le-secret-du-lagon' },
    update: {},
    create: {
      slug: 'le-secret-du-lagon',
      title: 'Le Secret du Lagon',
      synopsis:
        "À Lomé, Awa hérite d'un hôtel en bord de lagune et découvre que son défunt père cachait une seconde famille. Entre rivalités, trahisons et un amour impossible, chaque épisode révèle un nouveau secret.",
      genres: ['romance', 'drame'],
      tags: ['héritage', 'famille', 'lomé'],
      originalLanguage: 'fr',
      posterVerticalUrl: 'https://placehold.co/1080x1920/0b1d2a/ffffff?text=Le+Secret+du+Lagon',
      posterHorizontalUrl: 'https://placehold.co/1920x1080/0b1d2a/ffffff?text=Le+Secret+du+Lagon',
      freeEpisodeCount: 2,
      coinCostPerEpisode: 10,
      status: 'PUBLISHED',
      territories: [],
      ageRating: 'PG12',
      publishedAt,
    },
  });

  const episodes = [
    { number: 1, title: "L'héritage", durationSeconds: 634, hlsKey: TEST_STREAMS[0] },
    { number: 2, title: 'La seconde famille', durationSeconds: 90, hlsKey: TEST_STREAMS[1] },
    { number: 3, title: 'Le testament', durationSeconds: 120, hlsKey: TEST_STREAMS[2] },
  ];
  for (const ep of episodes) {
    const saved = await prisma.episode.upsert({
      where: { seriesId_number: { seriesId: series.id, number: ep.number } },
      update: { hlsKey: ep.hlsKey, durationSeconds: ep.durationSeconds, transcodeStatus: 'READY' },
      create: {
        seriesId: series.id,
        number: ep.number,
        title: ep.title,
        durationSeconds: ep.durationSeconds,
        transcodeStatus: 'READY',
        hlsKey: ep.hlsKey,
        previewKey: ep.hlsKey,
        thumbnailUrl: `https://placehold.co/1080x1920/1f3a4d/ffffff?text=E${ep.number}`,
        publishedAt: new Date(publishedAt.getTime() + ep.number * 86_400_000),
      },
    });
    await prisma.subtitle.upsert({
      where: { episodeId_language: { episodeId: saved.id, language: 'fr' } },
      update: {},
      create: { episodeId: saved.id, language: 'fr', fileUrl: `subtitles/${saved.id}/fr.vtt` },
    });
  }
  console.log(
    `series "${series.title}" with ${episodes.length} episodes (free: ${series.freeEpisodeCount})`,
  );

  // Une série brouillon : ne doit jamais apparaître dans le catalogue public.
  await prisma.series.upsert({
    where: { slug: 'ombres-sur-abidjan' },
    update: {},
    create: {
      slug: 'ombres-sur-abidjan',
      title: 'Ombres sur Abidjan',
      synopsis: 'Thriller en préparation (brouillon).',
      genres: ['thriller'],
      status: 'DRAFT',
      freeEpisodeCount: 5,
      coinCostPerEpisode: 12,
    },
  });
  console.log('draft series "Ombres sur Abidjan" (hidden from the public catalog)');
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
