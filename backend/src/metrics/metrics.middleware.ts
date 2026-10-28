import { type NextFunction, type Request, type Response } from 'express';
import { type MetricsService } from './metrics.service.js';

/** Observe la durée de chaque requête avec le gabarit de route Express (`/series/:id`), pas l'URL brute. */
export function metricsMiddleware(metrics: MetricsService) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const route = req.route as { path?: string } | undefined;
      const template = route?.path ? `${req.baseUrl ?? ''}${route.path}` : 'unmatched';
      const seconds = Number(process.hrtime.bigint() - start) / 1e9;
      metrics.observeHttp(req.method, template, res.statusCode, seconds);
    });
    next();
  };
}
