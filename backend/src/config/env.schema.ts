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

  // Appareil de confiance du back-office (B-13+, contrat v1.3).
  TRUSTED_DEVICE_DAYS: z.coerce.number().int().min(1).max(365).default(30),

  // Notifications push (S06-BE-01, B-10) : `log` (dev) ou `fcm` (Firebase Admin SDK).
  PUSH_PROVIDER: z.enum(['log', 'fcm']).default('log'),
  FIREBASE_SERVICE_ACCOUNT_JSON: z.string().min(2).optional(),
  FIREBASE_SERVICE_ACCOUNT_FILE: z.string().min(1).optional(),
  PUSH_DAILY_CAP: z.coerce.number().int().min(1).max(20).default(2),
  // false = envoi des campagnes en ligne (tests) au lieu de la file BullMQ `push`.
  PUSH_QUEUE_ENABLED: bool.default(true),
  PUSH_BATCH_SIZE: z.coerce.number().int().min(10).max(500).default(500),

  // Centre d'aide (S06-BE-02).
  SUPPORT_CONTACT_DAILY_LIMIT: z.coerce.number().int().min(1).max(100).default(5),

  // Achats (S07-BE-06/07) : vérificateur `google` (Play Developer API) ou `fake` (dev et tests).
  BILLING_VERIFIER: z.enum(['fake', 'google']).default('fake'),
  GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: z.string().min(2).optional(),
  GOOGLE_PLAY_SERVICE_ACCOUNT_FILE: z.string().min(1).optional(),
  GOOGLE_PLAY_PACKAGE_NAME: z.string().min(3).optional(),
  // Jeton attendu par POST /webhooks/google-rtdn (`?token=` ou bearer) ; vide = aucun contrôle.
  GOOGLE_RTDN_AUTH_TOKEN: z.string().min(16).optional(),
  // Validité par défaut des pièces bonus (jours) ; repris par les paramètres de monétisation.
  BONUS_VALIDITY_DAYS: z.coerce.number().int().min(1).max(3650).default(30),

  // Pub récompensée (S08-BE-03, contrat v1.5) : vérificateur SSV `admob` ou `fake` (dev et tests).
  AD_PROVIDER: z.enum(['fake', 'admob']).default('fake'),
  AD_SSV_FAKE_SECRET: z.string().min(16).default('dev-only-ad-ssv-fake-secret-0123456789'),
  ADMOB_REWARDED_UNIT_ID: z.string().min(1).optional(),
  ADMOB_SSV_KEYS_URL: z.url().default('https://www.gstatic.com/admob/reward/verifier-keys.json'),

  // Recharge mobile money (S09-BE-01/02) : `fake` (page de paiement simulée) ou `cinetpay`.
  MOBILE_MONEY_PROVIDER: z.enum(['fake', 'cinetpay']).default('fake'),
  MOBILE_MONEY_FAKE_SECRET: z
    .string()
    .min(16)
    .default('dev-only-mobile-money-fake-secret-0123456789'),
  CINETPAY_API_KEY: z.string().min(1).optional(),
  CINETPAY_SITE_ID: z.string().min(1).optional(),
  CINETPAY_SECRET: z.string().min(1).optional(),
  CINETPAY_BASE_URL: z.url().default('https://api-checkout.cinetpay.com/v2'),
  // Base publique de l'API (URL de notification du webhook, page de paiement simulée).
  TOPUP_PUBLIC_BASE_URL: z.url().default('http://localhost:3000'),
  // Page du site de recharge où l'agrégateur renvoie l'utilisateur après paiement (optionnelle).
  TOPUP_RETURN_URL: z.url().optional(),

  // Offre de bienvenue (M-24, B-07) : valeurs initiales de `monetization_settings` à la création de la ligne.
  WELCOME_OFFER_ACTIVE: bool.default(false),
  WELCOME_OFFER_BONUS_PERCENT: z.coerce.number().int().min(0).max(500).default(0),
  WELCOME_OFFER_HOURS: z.coerce.number().int().min(1).max(8760).default(48),

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
  if (
    env.PUSH_PROVIDER === 'fcm' &&
    !env.FIREBASE_SERVICE_ACCOUNT_JSON &&
    !env.FIREBASE_SERVICE_ACCOUNT_FILE
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['FIREBASE_SERVICE_ACCOUNT_JSON'],
      message:
        'FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_FILE is required when PUSH_PROVIDER=fcm',
    });
  }
  if (env.BILLING_VERIFIER === 'fake' && env.NODE_ENV === 'production') {
    ctx.addIssue({
      code: 'custom',
      path: ['BILLING_VERIFIER'],
      message: 'BILLING_VERIFIER=fake is not allowed in production',
    });
  }
  if (env.BILLING_VERIFIER === 'google') {
    if (!env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON && !env.GOOGLE_PLAY_SERVICE_ACCOUNT_FILE) {
      ctx.addIssue({
        code: 'custom',
        path: ['GOOGLE_PLAY_SERVICE_ACCOUNT_JSON'],
        message:
          'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON or GOOGLE_PLAY_SERVICE_ACCOUNT_FILE is required when BILLING_VERIFIER=google',
      });
    }
    if (!env.GOOGLE_PLAY_PACKAGE_NAME) {
      ctx.addIssue({
        code: 'custom',
        path: ['GOOGLE_PLAY_PACKAGE_NAME'],
        message: 'GOOGLE_PLAY_PACKAGE_NAME is required when BILLING_VERIFIER=google',
      });
    }
  }
  if (env.AD_PROVIDER === 'fake' && env.NODE_ENV === 'production') {
    ctx.addIssue({
      code: 'custom',
      path: ['AD_PROVIDER'],
      message: 'AD_PROVIDER=fake is not allowed in production',
    });
  }
  if (env.MOBILE_MONEY_PROVIDER === 'fake' && env.NODE_ENV === 'production') {
    ctx.addIssue({
      code: 'custom',
      path: ['MOBILE_MONEY_PROVIDER'],
      message: 'MOBILE_MONEY_PROVIDER=fake is not allowed in production',
    });
  }
  if (env.MOBILE_MONEY_PROVIDER === 'cinetpay') {
    for (const key of ['CINETPAY_API_KEY', 'CINETPAY_SITE_ID', 'CINETPAY_SECRET'] as const) {
      if (!env[key]) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `${key} is required when MOBILE_MONEY_PROVIDER=cinetpay`,
        });
      }
    }
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
