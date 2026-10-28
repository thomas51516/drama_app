import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Prisma 7 : la CLI ne lit plus .env toute seule, d'où l'import de dotenv ci-dessus.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
  },
});
