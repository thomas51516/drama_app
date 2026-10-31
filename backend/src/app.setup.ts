import { type INestApplication } from '@nestjs/common';
import helmet from 'helmet';
import { requestLogger } from './common/middleware/request-logger.middleware.js';
import { type AppConfig } from './config/app-config.js';
import { metricsMiddleware } from './metrics/metrics.middleware.js';
import { MetricsService } from './metrics/metrics.service.js';

/**
 * Configuration HTTP commune à `main.ts` et aux tests e2e :
 * helmet, CORS, journal des requêtes, arrêt propre.
 * Le ValidationPipe et le filtre d'exceptions sont déclarés dans AppModule (APP_PIPE / APP_FILTER).
 */
export function configureApp(app: INestApplication, config: AppConfig): INestApplication {
  app.use(
    helmet({
      // L'API ne sert que du JSON ; la CSP ne bloquerait que l'interface Swagger.
      contentSecurityPolicy: config.swaggerEnabled ? false : undefined,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      // HSTS explicite (audit sécurité S10-OPS, cahier des charges §12 : « HTTPS partout, HSTS »).
      // `preload: true` suppose un domaine stable soumis à hstspreload.org avant d'activer vraiment
      // le préchargement ; à retirer si ce n'est pas fait. N'a d'effet qu'une fois servi derrière
      // TLS : en dev (HTTP) le navigateur ignore cet en-tête — voir infra/traefik/ pour la
      // terminaison TLS réelle en production.
      strictTransportSecurity: {
        maxAge: 31_536_000, // 1 an
        includeSubDomains: true,
        preload: true,
      },
    }),
  );
  app.enableCors({
    origin: config.corsOrigins,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Authorization',
      'Content-Type',
      'Accept-Language',
      'X-Country',
      'X-Request-Id',
    ],
    exposedHeaders: ['X-Request-Id', 'Retry-After', 'X-RateLimit-Limit', 'X-RateLimit-Remaining'],
    maxAge: 600,
  });
  app.use(requestLogger());
  app.use(metricsMiddleware(app.get(MetricsService)));
  app.enableShutdownHooks();
  return app;
}
