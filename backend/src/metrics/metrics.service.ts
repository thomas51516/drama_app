import { Injectable } from '@nestjs/common';
import { type Queue } from 'bullmq';
import { collectDefaultMetrics, Gauge, Histogram, Registry } from 'prom-client';

/** Registre Prometheus du processus : métriques Node par défaut + durée des requêtes HTTP. */
@Injectable()
export class MetricsService {
  readonly registry = new Registry();
  readonly httpRequestDuration: Histogram<'method' | 'route' | 'status_code'>;
  /** Files BullMQ observées : jobs en attente et âge du plus ancien (alerte « file en retard »). */
  readonly queueWaiting: Gauge<'queue'>;
  readonly queueOldestWaiting: Gauge<'queue'>;
  private readonly queues = new Map<string, Queue>();

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
    this.queueWaiting = new Gauge({
      name: 'drama_queue_waiting_jobs',
      help: 'BullMQ jobs waiting or delayed, by queue',
      labelNames: ['queue'],
      registers: [this.registry],
      collect: () => this.collectQueues(),
    });
    this.queueOldestWaiting = new Gauge({
      name: 'drama_queue_oldest_waiting_seconds',
      help: 'Age in seconds of the oldest waiting BullMQ job, by queue',
      labelNames: ['queue'],
      registers: [this.registry],
    });
  }

  registerQueue(name: string, queue: Queue): void {
    this.queues.set(name, queue);
  }

  private async collectQueues(): Promise<void> {
    for (const [name, queue] of this.queues) {
      try {
        const counts = await queue.getJobCounts('waiting', 'delayed', 'prioritized');
        const waiting = (counts.waiting ?? 0) + (counts.delayed ?? 0) + (counts.prioritized ?? 0);
        this.queueWaiting.set({ queue: name }, waiting);
        const [oldest] = await queue.getJobs(['waiting'], 0, 0, true);
        const age = oldest ? Math.max(0, (Date.now() - oldest.timestamp) / 1000) : 0;
        this.queueOldestWaiting.set({ queue: name }, age);
      } catch {
        // Redis indisponible : les jauges gardent leur dernière valeur.
      }
    }
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
