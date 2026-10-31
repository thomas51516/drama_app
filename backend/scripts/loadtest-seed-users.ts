/**
 * Prépare le test de charge k6 (S10-OPS-01, infra/loadtest/) : crée un lot d'utilisateurs
 * invités jetables directement en base (pour ne pas cogner la limite de débit de
 * `/auth/guest`, 30 / IP / 15 min, qui n'a rien à voir avec ce qu'on mesure) et signe
 * un jeton d'accès valide pour chacun avec le même secret que l'API (JWT_ACCESS_SECRET).
 *
 * Usage : npx tsx scripts/loadtest-seed-users.ts [count]
 * Écrit infra/loadtest/.tokens.json ({ tokens: string[] }) et affiche un résumé.
 * Nettoyage : npx tsx scripts/loadtest-seed-users.ts --cleanup
 */
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outFile = join(__dirname, '../../infra/loadtest/.tokens.json');
const DEVICE_PREFIX = 'k6-loadtest-';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function cleanup() {
  const { count } = await prisma.user.deleteMany({
    where: { deviceId: { startsWith: DEVICE_PREFIX } },
  });
  console.log(
    `[loadtest] supprimé ${count} utilisateur(s) jetable(s) (device_id LIKE '${DEVICE_PREFIX}%')`,
  );
}

async function seed(count: number) {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) throw new Error('JWT_ACCESS_SECRET manquant (charger backend/.env)');

  const users = Array.from({ length: count }, (_, i) => ({
    type: 'GUEST' as const,
    status: 'ACTIVE' as const,
    deviceId: `${DEVICE_PREFIX}${Date.now()}-${i}`,
    language: 'fr',
  }));
  await prisma.user.createMany({ data: users });
  const created = await prisma.user.findMany({
    where: { deviceId: { in: users.map((u) => u.deviceId) } },
    select: { id: true, type: true },
  });

  const tokens = created.map((u) =>
    jwt.sign({ sub: u.id, typ: 'user', ut: u.type }, secret, {
      expiresIn: '12h',
      issuer: 'drama-api',
    }),
  );

  writeFileSync(outFile, JSON.stringify({ tokens }, null, 2));
  console.log(
    `[loadtest] ${tokens.length} utilisateurs invités créés, jetons écrits dans ${outFile}`,
  );
}

const arg = process.argv[2];
(async () => {
  if (arg === '--cleanup') {
    await cleanup();
  } else {
    const count = Number.parseInt(arg ?? '300', 10);
    await seed(count);
  }
})()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
