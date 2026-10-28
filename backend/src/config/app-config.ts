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

  get admin() {
    return {
      jwtSecret: this.env.ADMIN_JWT_SECRET,
      jwtTtlSeconds: this.env.ADMIN_JWT_TTL_SECONDS,
      totpEncryptionKey: this.env.TOTP_ENCRYPTION_KEY,
      totpIssuer: this.env.TOTP_ISSUER,
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
