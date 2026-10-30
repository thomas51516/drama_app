import { z } from 'zod';

const bool = z.stringbool();

/**
 * Schéma de validation des variables d'environnement (voir .env.example).
 * L'application refuse de démarrer si une variable obligatoire manque.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'log', 'debug', 'verbose']).default('log'),
  CORS_ORIGINS: z.string().default('http://localhost:3100,http://localhost:3000'),
  SWAGGER_ENABLED: bool.default(true),

  DATABASE_URL: z
    .string()
    .regex(/^postgres(ql)?:\/\//, 'DATABASE_URL must be a postgresql:// connection string'),
  REDIS_URL: z.string().regex(/^rediss?:\/\//, 'REDIS_URL must be a redis:// URL'),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).default(900),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().int().min(1).default(30),

  S3_ENDPOINT: z.url().default('http://localhost:9000'),
  S3_REGION: z.string().min(1).default('us-east-1'),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_BUCKET: z.string().min(1).default('drama-media'),
  S3_FORCE_PATH_STYLE: bool.default(true),

  CDN_BASE_URL: z.url().default('http://localhost:9000/drama-media'),
  PLAYBACK_URL_TTL_SECONDS: z.coerce.number().int().min(30).default(300),
  // Signature des URLs média (S04-BE-02) : `plain` (dev MinIO) ou `hmac` (CDN à jeton).
  MEDIA_SIGNER: z.enum(['plain', 'hmac']).default('plain'),
  MEDIA_SIGNING_KEY: z.string().min(16).optional(),

  // Connexion Google (S05-BE-01) : audiences acceptées, séparées par des virgules ; vide = désactivé.
  GOOGLE_CLIENT_IDS: z.string().default(''),
  // OTP SMS (S05-BE-02) : `console` (code dans les logs et Redis) ou `http` (POST JSON générique).
  SMS_PROVIDER: z.enum(['console', 'http']).default('console'),
  SMS_HTTP_URL: z.url().optional(),
  SMS_HTTP_TOKEN: z.string().min(1).optional(),
  // Suppression de compte différée (S05-BE-04, §14) et tâches planifiées (B-04).
  ACCOUNT_DELETION_GRACE_DAYS: z.coerce.number().int().min(0).max(365).default(30),
  SCHEDULER_ENABLED: bool.default(true),

  // Back-office (S03-BE-04) : JWT admin distinct du JWT utilisateur, secret TOTP chiffré au repos.
  ADMIN_JWT_SECRET: z.string().min(32, 'ADMIN_JWT_SECRET must be at least 32 characters'),
  ADMIN_JWT_TTL_SECONDS: z.coerce.number().int().min(300).default(28_800),
  TOTP_ENCRYPTION_KEY: z.string().min(32, 'TOTP_ENCRYPTION_KEY must be at least 32 characters'),
  TOTP_ISSUER: z.string().min(1).default('DRAMA back-office'),

  // Upload direct (S02-BE-04)
  UPLOAD_URL_TTL_SECONDS: z.coerce.number().int().min(60).max(86_400).default(900),

  // Transcodage (S02-BE-05)
  TRANSCODE_PROVIDER: z.enum(['local', 'webhook']).default('local'),
  TRANSCODE_WORKER_ENABLED: bool.default(true),
  TRANSCODE_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(1),
  TRANSCODE_WEBHOOK_SECRET: z.string().min(16).optional(),
  TRANSCODE_SUBMIT_URL: z.url().optional(),
  FFMPEG_PATH: z.string().min(1).default('ffmpeg'),
  FFPROBE_PATH: z.string().min(1).default('ffprobe'),

  // Limitation de débit (S02-BE-02)
  RATE_LIMIT_ENABLED: bool.default(true),

  // Observabilité (S02-OPS-02)
  METRICS_ENABLED: bool.default(true),
  METRICS_TOKEN: z.string().min(16).optional(),
  SENTRY_DSN: z
    .url()
    .optional()
    .or(z.literal('').transform(() => undefined)),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),
  SENTRY_ENVIRONMENT: z.string().min(1).optional(),

  SEED_ADMIN_EMAIL: z.email().optional(),
  SEED_ADMIN_PASSWORD: z.string().min(8).optional(),
});

export type Env = z.infer<typeof envSchema>;

const envSchemaWithRules = envSchema.superRefine((env, ctx) => {
  if (env.MEDIA_SIGNER === 'hmac' && !env.MEDIA_SIGNING_KEY) {
    ctx.addIssue({
      code: 'custom',
      path: ['MEDIA_SIGNING_KEY'],
      message: 'MEDIA_SIGNING_KEY is required when MEDIA_SIGNER=hmac',
    });
  }
  if (env.SMS_PROVIDER === 'http' && !env.SMS_HTTP_URL) {
    ctx.addIssue({
      code: 'custom',
      path: ['SMS_HTTP_URL'],
      message: 'SMS_HTTP_URL is required when SMS_PROVIDER=http',
    });
  }
});

export function validateEnv(raw: NodeJS.ProcessEnv): Env {
  const result = envSchemaWithRules.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
