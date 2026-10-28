import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';
import { type ComponentHealthDto, type HealthReportDto, type LivenessDto } from './health.dto.js';

const PROBE_TIMEOUT_MS = 2_000;
const STARTED_AT = Date.now();

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  liveness(): LivenessDto {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round((Date.now() - STARTED_AT) / 1000),
    };
  }

  async check(): Promise<HealthReportDto> {
    const [database, redis] = await Promise.all([
      this.probe(() => this.prisma.$queryRaw`SELECT 1`),
      this.probe(() => this.redis.ping()),
    ]);
    const healthy = database.status === 'up' && redis.status === 'up';
    return {
      status: healthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round((Date.now() - STARTED_AT) / 1000),
      checks: { database, redis },
    };
  }

  private async probe(fn: () => Promise<unknown>): Promise<ComponentHealthDto> {
    const start = performance.now();
    try {
      await withTimeout(fn(), PROBE_TIMEOUT_MS);
      return { status: 'up', latencyMs: round(performance.now() - start) };
    } catch (err) {
      return {
        status: 'down',
        latencyMs: round(performance.now() - start),
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}
