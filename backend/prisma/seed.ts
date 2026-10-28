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

// Épisodes de test verticaux 9:16 générés par infra/media-samples/generate.sh et déposés dans MinIO
// par upload.sh. Clés relatives : l'URL finale est CDN_BASE_URL + clé (voir resolveMediaUrl).
// Tant que le pipeline vidéo n'existe pas (S02-BE-05), ces clés tiennent lieu de rendu transcodé.
const sampleKey = (n: number): string => `hls/samples/ep${n}/master.m3u8`;
const samplePreviewKey = (n: number): string => `hls/samples/ep${n}/preview/index.m3u8`;
const sampleThumbnail = (cdn: string, n: number): string =>
  `${cdn}/hls/samples/ep${n}/thumbnail.jpg`;
const cdnBaseUrl = (process.env.CDN_BASE_URL ?? 'http://localhost:9000/drama-media').replace(
  /\/+$/,
  '',
);

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

  // Un compte par rôle (même mot de passe que l'admin) pour tester les règles du back-office.
  const domain = adminEmail.split('@')[1] ?? 'drama.local';
  for (const [role, displayName] of [
    ['EDITOR', 'Éditeur'],
    ['MONETIZATION', 'Monétisation'],
    ['SUPPORT', 'Support'],
  ] as const) {
    const email = `${role.toLowerCase()}@${domain}`;
    await prisma.adminAccount.upsert({
      where: { email },
      update: {},
      create: {
        email,
        displayName,
        role,
        passwordHash: await argon2.hash(adminPassword, { type: argon2.argon2id }),
      },
    });
    console.log(`admin account: ${email} (${role})`);
  }

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
    { number: 1, title: "L'héritage", durationSeconds: 30, hlsKey: sampleKey(1) },
    { number: 2, title: 'La seconde famille', durationSeconds: 30, hlsKey: sampleKey(2) },
    { number: 3, title: 'Le testament', durationSeconds: 30, hlsKey: sampleKey(3) },
  ];
  for (const ep of episodes) {
    const saved = await prisma.episode.upsert({
      where: { seriesId_number: { seriesId: series.id, number: ep.number } },
      update: {
        hlsKey: ep.hlsKey,
        previewKey: samplePreviewKey(ep.number),
        thumbnailUrl: sampleThumbnail(cdnBaseUrl, ep.number),
        durationSeconds: ep.durationSeconds,
        transcodeStatus: 'READY',
      },
      create: {
        seriesId: series.id,
        number: ep.number,
        title: ep.title,
        durationSeconds: ep.durationSeconds,
        transcodeStatus: 'READY',
        hlsKey: ep.hlsKey,
        previewKey: samplePreviewKey(ep.number),
        thumbnailUrl: sampleThumbnail(cdnBaseUrl, ep.number),
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
