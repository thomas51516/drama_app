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
      update: { fileUrl: `hls/samples/ep${ep.number}/subtitles/fr.vtt` },
      create: {
        episodeId: saved.id,
        language: 'fr',
        fileUrl: `hls/samples/ep${ep.number}/subtitles/fr.vtt`,
      },
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

  // Mise en avant (B-05) : une bannière et les rangées de l'accueil (M-01), titrées en fr/en/es/pt.
  const existingBanner = await prisma.homeBanner.findFirst({ where: { seriesId: series.id } });
  if (!existingBanner) {
    await prisma.homeBanner.create({
      data: {
        seriesId: series.id,
        title: 'Le Secret du Lagon',
        subtitle: 'Nouvelle saison : 2 épisodes gratuits',
        countries: [],
        position: 1,
        isActive: true,
      },
    });
  }
  const rows: Array<{
    key: string;
    type: 'TRENDING' | 'NEW' | 'GENRE' | 'MANUAL' | 'CONTINUE_WATCHING';
    titles: Record<string, string>;
    genre?: string;
  }> = [
    {
      key: 'trending',
      type: 'TRENDING',
      titles: { fr: 'Tendances', en: 'Trending', es: 'Tendencias', pt: 'Tendências' },
    },
    {
      key: 'continue_watching',
      type: 'CONTINUE_WATCHING',
      titles: {
        fr: 'Continuer à regarder',
        en: 'Continue watching',
        es: 'Seguir viendo',
        pt: 'Continuar assistindo',
      },
    },
    {
      key: 'new',
      type: 'NEW',
      titles: { fr: 'Nouveautés', en: 'New releases', es: 'Novedades', pt: 'Novidades' },
    },
    {
      key: 'genre-romance',
      type: 'GENRE',
      genre: 'romance',
      titles: { fr: 'Romance', en: 'Romance', es: 'Romance', pt: 'Romance' },
    },
    {
      key: 'genre-drame',
      type: 'GENRE',
      genre: 'drame',
      titles: { fr: 'Drame', en: 'Drama', es: 'Drama', pt: 'Drama' },
    },
    {
      key: 'genre-thriller',
      type: 'GENRE',
      genre: 'thriller',
      titles: { fr: 'Thriller', en: 'Thriller', es: 'Suspenso', pt: 'Suspense' },
    },
  ];
  for (const [index, row] of rows.entries()) {
    await prisma.homeRow.upsert({
      where: { key: row.key },
      update: {},
      create: {
        key: row.key,
        type: row.type,
        titles: row.titles,
        genre: row.genre ?? null,
        seriesIds: [],
        countries: [],
        position: index + 1,
        isActive: true,
      },
    });
  }
  console.log(
    `home configuration: 1 banner, ${rows.length} rows (${rows.map((r) => r.key).join(', ')})`,
  );

  // FAQ de départ (M-53) : seulement si aucune entrée n'existe, pour ne pas écraser le travail éditorial.
  if ((await prisma.faqEntry.count()) === 0) {
    const faq = [
      {
        category: 'account',
        question: {
          fr: 'Dois-je créer un compte pour regarder ?',
          en: 'Do I need an account to watch?',
          es: '¿Necesito una cuenta para ver?',
          pt: 'Preciso de uma conta para assistir?',
        },
        answer: {
          fr: 'Non. Vous pouvez regarder les épisodes gratuits sans compte. Créer un compte (Google, téléphone ou e-mail) permet de retrouver votre historique, vos favoris et vos pièces sur tous vos appareils.',
          en: 'No. You can watch free episodes without an account. Creating one (Google, phone or e-mail) keeps your history, favourites and coins on all your devices.',
          es: 'No. Puedes ver los episodios gratuitos sin cuenta. Crear una (Google, teléfono o correo) conserva tu historial, favoritos y monedas en todos tus dispositivos.',
          pt: 'Não. Pode assistir aos episódios gratuitos sem conta. Criar uma (Google, telefone ou e-mail) guarda o seu histórico, favoritos e moedas em todos os seus aparelhos.',
        },
      },
      {
        category: 'coins',
        question: {
          fr: 'À quoi servent les pièces ?',
          en: 'What are coins for?',
          es: '¿Para qué sirven las monedas?',
          pt: 'Para que servem as moedas?',
        },
        answer: {
          fr: 'Les pièces débloquent les épisodes payants. Les premiers épisodes de chaque série sont gratuits. Les pièces bonus offertes sont utilisées en premier et peuvent expirer.',
          en: 'Coins unlock paid episodes. The first episodes of every series are free. Bonus coins are spent first and may expire.',
          es: 'Las monedas desbloquean los episodios de pago. Los primeros episodios de cada serie son gratuitos. Las monedas de regalo se usan primero y pueden caducar.',
          pt: 'As moedas desbloqueiam os episódios pagos. Os primeiros episódios de cada série são gratuitos. As moedas bónus são usadas primeiro e podem expirar.',
        },
      },
      {
        category: 'vip',
        question: {
          fr: "Que comprend l'abonnement VIP ?",
          en: 'What does the VIP subscription include?',
          es: '¿Qué incluye la suscripción VIP?',
          pt: 'O que inclui a assinatura VIP?',
        },
        answer: {
          fr: "L'abonnement VIP donne accès à tous les épisodes pendant sa durée, sans dépenser de pièces. Il se gère depuis Google Play.",
          en: 'VIP gives access to every episode for the duration of the subscription, without spending coins. It is managed from Google Play.',
          es: 'El VIP da acceso a todos los episodios durante la suscripción, sin gastar monedas. Se gestiona desde Google Play.',
          pt: 'O VIP dá acesso a todos os episódios durante a assinatura, sem gastar moedas. É gerido a partir do Google Play.',
        },
      },
      {
        category: 'playback',
        question: {
          fr: 'La vidéo met du temps à démarrer ou saccade, que faire ?',
          en: 'The video is slow to start or stutters, what can I do?',
          es: 'El vídeo tarda en empezar o se entrecorta, ¿qué hago?',
          pt: 'O vídeo demora a começar ou trava, o que fazer?',
        },
        answer: {
          fr: "Dans le lecteur, touchez l'engrenage et choisissez une qualité plus basse, ou laissez « Auto ». Vérifiez aussi votre connexion : en 3G, l'application réduit la qualité automatiquement.",
          en: 'In the player, tap the gear and pick a lower quality, or leave it on Auto. Check your connection too: on 3G the app lowers the quality automatically.',
          es: 'En el reproductor, toca el engranaje y elige una calidad más baja, o déjalo en Auto. Revisa también tu conexión: en 3G la app baja la calidad automáticamente.',
          pt: 'No leitor, toque na engrenagem e escolha uma qualidade mais baixa, ou deixe em Auto. Verifique também a sua ligação: em 3G a aplicação reduz a qualidade automaticamente.',
        },
      },
      {
        category: 'payment',
        question: {
          fr: 'Puis-je payer par mobile money ?',
          en: 'Can I pay with mobile money?',
          es: '¿Puedo pagar con dinero móvil?',
          pt: 'Posso pagar com mobile money?',
        },
        answer: {
          fr: 'Oui, via notre site de recharge : connectez-vous avec le même compte, choisissez un pack et payez avec Flooz, T-Money, MTN MoMo, Orange Money ou Wave selon votre pays. Les pièces sont créditées sur ce compte.',
          en: 'Yes, through our top-up website: sign in with the same account, choose a pack and pay with Flooz, T-Money, MTN MoMo, Orange Money or Wave depending on your country. Coins are credited to that account.',
          es: 'Sí, a través de nuestro sitio de recarga: inicia sesión con la misma cuenta, elige un paquete y paga con Flooz, T-Money, MTN MoMo, Orange Money o Wave según tu país. Las monedas se acreditan en esa cuenta.',
          pt: 'Sim, através do nosso site de recarga: inicie sessão com a mesma conta, escolha um pacote e pague com Flooz, T-Money, MTN MoMo, Orange Money ou Wave consoante o país. As moedas são creditadas nessa conta.',
        },
      },
      {
        category: 'content',
        question: {
          fr: 'À quel rythme sortent les nouveaux épisodes ?',
          en: 'How often are new episodes released?',
          es: '¿Con qué frecuencia salen nuevos episodios?',
          pt: 'Com que frequência saem novos episódios?',
        },
        answer: {
          fr: 'Chaque série a son propre calendrier, souvent un épisode par jour. Ajoutez une série à Ma liste pour être prévenu à chaque nouvel épisode.',
          en: 'Each series has its own schedule, often one episode a day. Add a series to My list to be notified of every new episode.',
          es: 'Cada serie tiene su propio calendario, a menudo un episodio al día. Añade una serie a Mi lista para recibir un aviso en cada nuevo episodio.',
          pt: 'Cada série tem o seu próprio calendário, muitas vezes um episódio por dia. Adicione uma série à Minha lista para ser avisado a cada novo episódio.',
        },
      },
    ];
    await prisma.faqEntry.createMany({
      data: faq.map((entry, index) => ({ ...entry, position: index + 1, isPublished: true })),
    });
    console.log(`faq: ${faq.length} starter entries`);
  }
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
