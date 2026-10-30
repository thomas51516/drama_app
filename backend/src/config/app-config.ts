import { type LogLevel } from '@nestjs/common';
import { type Env } from './env.schema.js';

const LOG_LEVEL_ORDER: LogLevel[] = ['verbose', 'debug', 'log', 'warn', 'error', 'fatal'];

/** Configuration typée, construite une seule fois à partir de l'environnement validé. */
export class AppConfig {
  constructor(readonly env: Env) {}

  get nodeEnv(): Env['NODE_ENV'] {
    return this.env.NODE_ENV;
  }

  get isProduction(): boolean {
    return this.env.NODE_ENV === 'production';
  }

  get port(): number {
    return this.env.PORT;
  }

  /** Niveaux Nest activés à partir de LOG_LEVEL. */
  get logLevels(): LogLevel[] {
    const idx = LOG_LEVEL_ORDER.indexOf(this.env.LOG_LEVEL);
    return LOG_LEVEL_ORDER.slice(idx);
  }

  /** `true` autorise toutes les origines (dev), sinon liste blanche. */
  get corsOrigins(): true | string[] {
    const raw = this.env.CORS_ORIGINS.trim();
    if (raw === '*' || raw === '') return true;
    return raw
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
  }

  get swaggerEnabled(): boolean {
    return this.env.SWAGGER_ENABLED;
  }

  get databaseUrl(): string {
    return this.env.DATABASE_URL;
  }

  get redisUrl(): string {
    return this.env.REDIS_URL;
  }

  get jwtAccessSecret(): string {
    return this.env.JWT_ACCESS_SECRET;
  }

  get accessTokenTtlSeconds(): number {
    return this.env.JWT_ACCESS_TTL_SECONDS;
  }

  get refreshTokenSecret(): string {
    return this.env.JWT_REFRESH_SECRET;
  }

  get refreshTokenTtlDays(): number {
    return this.env.JWT_REFRESH_TTL_DAYS;
  }

  get s3() {
    return {
      endpoint: this.env.S3_ENDPOINT,
      region: this.env.S3_REGION,
      accessKey: this.env.S3_ACCESS_KEY,
      secretKey: this.env.S3_SECRET_KEY,
      bucket: this.env.S3_BUCKET,
      forcePathStyle: this.env.S3_FORCE_PATH_STYLE,
    };
  }

  get cdnBaseUrl(): string {
    return this.env.CDN_BASE_URL.replace(/\/+$/, '');
  }

  get playbackUrlTtlSeconds(): number {
    return this.env.PLAYBACK_URL_TTL_SECONDS;
  }

  /** Signature des URLs média (S04-BE-02). */
  get mediaSigner() {
    return {
      mode: this.env.MEDIA_SIGNER,
      key: this.env.MEDIA_SIGNING_KEY,
      ttlSeconds: this.env.PLAYBACK_URL_TTL_SECONDS,
    };
  }

  /** Audiences Google acceptées ; liste vide = connexion Google désactivée (503 GOOGLE_AUTH_DISABLED). */
  get googleClientIds(): string[] {
    return this.env.GOOGLE_CLIENT_IDS.split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  get sms() {
    return {
      provider: this.env.SMS_PROVIDER,
      httpUrl: this.env.SMS_HTTP_URL,
      httpToken: this.env.SMS_HTTP_TOKEN,
    };
  }

  get accountDeletionGraceDays(): number {
    return this.env.ACCOUNT_DELETION_GRACE_DAYS;
  }

  get schedulerEnabled(): boolean {
    return this.env.SCHEDULER_ENABLED;
  }

  get admin() {
    return {
      jwtSecret: this.env.ADMIN_JWT_SECRET,
      jwtTtlSeconds: this.env.ADMIN_JWT_TTL_SECONDS,
      totpEncryptionKey: this.env.TOTP_ENCRYPTION_KEY,
      totpIssuer: this.env.TOTP_ISSUER,
      trustedDeviceDays: this.env.TRUSTED_DEVICE_DAYS,
    };
  }

  /** Notifications push (S06-BE-01, B-10). */
  get push() {
    return {
      provider: this.env.PUSH_PROVIDER,
      firebaseServiceAccountJson: this.env.FIREBASE_SERVICE_ACCOUNT_JSON,
      firebaseServiceAccountFile: this.env.FIREBASE_SERVICE_ACCOUNT_FILE,
      dailyCap: this.env.PUSH_DAILY_CAP,
      queueEnabled: this.env.PUSH_QUEUE_ENABLED,
      batchSize: this.env.PUSH_BATCH_SIZE,
    };
  }

  /** Centre d'aide (S06-BE-02). */
  get support() {
    return { contactDailyLimit: this.env.SUPPORT_CONTACT_DAILY_LIMIT };
  }

  /** Achats Google Play (S07-BE-06/07). */
  get billing() {
    return {
      verifier: this.env.BILLING_VERIFIER,
      serviceAccountJson: this.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON,
      serviceAccountFile: this.env.GOOGLE_PLAY_SERVICE_ACCOUNT_FILE,
      packageName: this.env.GOOGLE_PLAY_PACKAGE_NAME,
      rtdnAuthToken: this.env.GOOGLE_RTDN_AUTH_TOKEN,
      bonusValidityDays: this.env.BONUS_VALIDITY_DAYS,
    };
  }

  /** Pub récompensée (S08-BE-03). */
  get ads() {
    return {
      provider: this.env.AD_PROVIDER,
      fakeSecret: this.env.AD_SSV_FAKE_SECRET,
      admobRewardedUnitId: this.env.ADMOB_REWARDED_UNIT_ID,
      admobKeysUrl: this.env.ADMOB_SSV_KEYS_URL,
    };
  }

  /** Recharge mobile money (S09-BE-01/02). */
  get topup() {
    return {
      provider: this.env.MOBILE_MONEY_PROVIDER,
      fakeSecret: this.env.MOBILE_MONEY_FAKE_SECRET,
      cinetpayApiKey: this.env.CINETPAY_API_KEY,
      cinetpaySiteId: this.env.CINETPAY_SITE_ID,
      cinetpaySecret: this.env.CINETPAY_SECRET,
      cinetpayBaseUrl: this.env.CINETPAY_BASE_URL.replace(/\/+$/, ''),
      publicBaseUrl: this.env.TOPUP_PUBLIC_BASE_URL.replace(/\/+$/, ''),
      returnUrl: this.env.TOPUP_RETURN_URL,
    };
  }

  /** Offre de bienvenue (M-24) : défauts appliqués à la création de `monetization_settings`. */
  get welcomeOffer() {
    return {
      active: this.env.WELCOME_OFFER_ACTIVE,
      bonusPercent: this.env.WELCOME_OFFER_BONUS_PERCENT,
      hours: this.env.WELCOME_OFFER_HOURS,
    };
  }

  get uploadUrlTtlSeconds(): number {
    return this.env.UPLOAD_URL_TTL_SECONDS;
  }

  get transcode() {
    return {
      provider: this.env.TRANSCODE_PROVIDER,
      workerEnabled: this.env.TRANSCODE_WORKER_ENABLED,
      concurrency: this.env.TRANSCODE_CONCURRENCY,
      webhookSecret: this.env.TRANSCODE_WEBHOOK_SECRET,
      submitUrl: this.env.TRANSCODE_SUBMIT_URL,
      ffmpegPath: this.env.FFMPEG_PATH,
      ffprobePath: this.env.FFPROBE_PATH,
    };
  }

  get rateLimitEnabled(): boolean {
    return this.env.RATE_LIMIT_ENABLED;
  }

  get metrics() {
    return { enabled: this.env.METRICS_ENABLED, token: this.env.METRICS_TOKEN };
  }

  get sentry() {
    return {
      dsn: this.env.SENTRY_DSN,
      tracesSampleRate: this.env.SENTRY_TRACES_SAMPLE_RATE,
      environment: this.env.SENTRY_ENVIRONMENT ?? this.env.NODE_ENV,
    };
  }
}
