import { Injectable } from '@nestjs/common';
import { collectDefaultMetrics, Histogram, Registry } from 'prom-client';

/** Registre Prometheus du processus : métriques Node par défaut + durée des requêtes HTTP. */
@Injectable()
export class MetricsService {
  readonly registry = new Registry();
  readonly httpRequestDuration: Histogram<'method' | 'route' | 'status_code'>;

  constructor() {
    this.registry.setDefaultLabels({ service: 'drama-api' });
    collectDefaultMetrics({ register: this.registry, prefix: 'drama_' });
    this.httpRequestDuration = new Histogram({
      name: 'drama_http_request_duration_seconds',
      help: 'HTTP request duration by route and status code',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });
  }

  observeHttp(method: string, route: string, statusCode: number, seconds: number): void {
    this.httpRequestDuration.observe({ method, route, status_code: String(statusCode) }, seconds);
  }

  render(): Promise<string> {
    return this.registry.metrics();
  }

  get contentType(): string {
    return this.registry.contentType;
  }
}
