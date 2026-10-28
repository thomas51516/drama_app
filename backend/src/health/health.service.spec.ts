import { HealthService } from './health.service.js';

function makeService(
  overrides: { db?: () => Promise<unknown>; redis?: () => Promise<string> } = {},
) {
  const prisma = { $queryRaw: vi.fn(overrides.db ?? (() => Promise.resolve([{ '?column?': 1 }]))) };
  const redis = { ping: vi.fn(overrides.redis ?? (() => Promise.resolve('PONG'))) };
  return { service: new HealthService(prisma as never, redis as never), prisma, redis };
}

describe('HealthService', () => {
  it('reports ok when database and redis answer', async () => {
    const { service, prisma, redis } = makeService();
    const report = await service.check();

    expect(report.status).toBe('ok');
    expect(report.checks.database.status).toBe('up');
    expect(report.checks.redis.status).toBe('up');
    expect(report.checks.database.latencyMs).toBeGreaterThanOrEqual(0);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(redis.ping).toHaveBeenCalledTimes(1);
  });

  it('reports degraded with the error when redis is down', async () => {
    const { service } = makeService({ redis: () => Promise.reject(new Error('ECONNREFUSED')) });
    const report = await service.check();

    expect(report.status).toBe('degraded');
    expect(report.checks.redis).toMatchObject({ status: 'down', error: 'ECONNREFUSED' });
    expect(report.checks.database.status).toBe('up');
  });

  it('reports degraded when the database fails', async () => {
    const { service } = makeService({ db: () => Promise.reject(new Error('db down')) });
    const report = await service.check();

    expect(report.status).toBe('degraded');
    expect(report.checks.database).toMatchObject({ status: 'down', error: 'db down' });
  });

  it('liveness never touches dependencies', () => {
    const { service, prisma, redis } = makeService();
    expect(service.liveness().status).toBe('ok');
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(redis.ping).not.toHaveBeenCalled();
  });
});
