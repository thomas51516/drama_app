import * as Sentry from '@sentry/nestjs';

/**
 * Sentry (S02-OPS-02) : initialisé uniquement si SENTRY_DSN est défini, avant la création de
 * l'application Nest. Les 5xx sont capturées par AllExceptionsFilter via `captureException`.
 */
export function initSentry(env: NodeJS.ProcessEnv = process.env): boolean {
  const dsn = env.SENTRY_DSN?.trim();
  if (!dsn) return false;
  Sentry.init({
    dsn,
    environment: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV ?? 'development',
    tracesSampleRate: Number(env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    release: env.npm_package_version ? `drama-backend@${env.npm_package_version}` : undefined,
  });
  return true;
}

export function captureException(error: unknown, context?: Record<string, unknown>): void {
  if (!Sentry.isInitialized()) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
}

export async function flushSentry(timeoutMs = 2000): Promise<void> {
  if (Sentry.isInitialized()) await Sentry.flush(timeoutMs);
}
