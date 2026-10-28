import { type INestApplication } from '@nestjs/common';
import helmet from 'helmet';
import { requestLogger } from './common/middleware/request-logger.middleware.js';
import { type AppConfig } from './config/app-config.js';

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
    }),
  );
  app.enableCors({
    origin: config.corsOrigins,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Accept-Language', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 600,
  });
  app.use(requestLogger());
  app.enableShutdownHooks();
  return app;
}
