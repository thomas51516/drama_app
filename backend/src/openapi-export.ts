/**
 * Exporte le contrat OpenAPI sans ouvrir de port : `npm run openapi:export [chemin]`.
 * Par défaut : <monorepo>/docs/api/openapi.v1.json (v0.1 conservée pour l'historique).
 */
import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { buildOpenApiDocument } from './openapi/openapi.js';

// Valeurs de repli : l'export ne se connecte à rien mais la configuration est validée.
const fallbacks: Record<string, string> = {
  DATABASE_URL: 'postgresql://export:export@localhost:5432/export',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'openapi-export-placeholder-secret-0123456789abcdef',
  JWT_REFRESH_SECRET: 'openapi-export-placeholder-secret-0123456789abcdef',
  S3_ACCESS_KEY: 'export',
  S3_SECRET_KEY: 'export',
  ADMIN_JWT_SECRET: 'openapi-export-placeholder-secret-0123456789abcdef',
  TOTP_ENCRYPTION_KEY: 'openapi-export-placeholder-secret-0123456789abcdef',
  // Aucune connexion Redis/BullMQ pendant l'export.
  TRANSCODE_PROVIDER: 'webhook',
  TRANSCODE_WORKER_ENABLED: 'false',
};
for (const [key, value] of Object.entries(fallbacks)) process.env[key] ??= value;

const target = resolve(
  process.argv[2] ?? resolve(import.meta.dirname, '../../docs/api/openapi.v1.json'),
);

const app = await NestFactory.create(AppModule, { logger: false });
try {
  const document = buildOpenApiDocument(app);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  const paths = Object.keys(document.paths).length;
  console.log(`OpenAPI ${document.info.version} (${paths} paths) written to ${target}`);
} finally {
  await app.close();
}
