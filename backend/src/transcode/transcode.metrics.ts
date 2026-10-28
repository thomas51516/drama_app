import { Injectable } from '@nestjs/common';
import { Counter, Gauge, Histogram } from 'prom-client';
import { MetricsService } from '../metrics/metrics.service.js';

/** Compteurs Prometheus du pipeline vidéo (S02-OPS-02). */
@Injectable()
export class TranscodeMetrics {
  readonly jobsTotal: Counter<'status' | 'provider'>;
  readonly jobDuration: Histogram<'provider'>;
  readonly activeJobs: Gauge;

  constructor(metrics: MetricsService) {
    this.jobsTotal = new Counter({
      name: 'drama_transcode_jobs_total',
      help: 'Transcode jobs by final status (ready, failed) and provider',
      labelNames: ['status', 'provider'],
      registers: [metrics.registry],
    });
    this.jobDuration = new Histogram({
      name: 'drama_transcode_job_duration_seconds',
      help: 'Wall time of local transcode jobs',
      labelNames: ['provider'],
      buckets: [5, 15, 30, 60, 120, 300, 600, 1200, 1800],
      registers: [metrics.registry],
    });
    this.activeJobs = new Gauge({
      name: 'drama_transcode_active_jobs',
      help: 'Transcode jobs currently running in this process',
      registers: [metrics.registry],
    });
  }
}
