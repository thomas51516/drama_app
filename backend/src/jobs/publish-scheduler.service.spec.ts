import { publishedSeriesWhere } from '../catalog/catalog.where.js';
import { PUBLISH_LAST_RUN_KEY, PublishSchedulerService } from './publish-scheduler.service.js';

function makeService(lastRun: string | null) {
  const prisma = {
    series: { findMany: vi.fn(() => Promise.resolve([{ id: 's1' }])) },
    episode: {
      findMany: vi.fn(() =>
        Promise.resolve([
          { id: 'e1', seriesId: 's1' },
          { id: 'e2', seriesId: 's2' },
        ]),
      ),
    },
  };
  const redisStore = new Map<string, string>();
  if (lastRun) redisStore.set(PUBLISH_LAST_RUN_KEY, lastRun);
  const redis = {
    client: {
      get: vi.fn((k: string) => Promise.resolve(redisStore.get(k) ?? null)),
      set: vi.fn((k: string, v: string) => {
        redisStore.set(k, v);
        return Promise.resolve('OK');
      }),
    },
  };
  const cache = {
    invalidateSeries: vi.fn(() => Promise.resolve(1)),
    invalidateHome: vi.fn(() => Promise.resolve(1)),
  };
  const notifier = { notifyEpisode: vi.fn(() => Promise.resolve({ notified: 0 })) };
  const service = new PublishSchedulerService(
    prisma as never,
    redis as never,
    cache as never,
    notifier as never,
  );
  return { service, prisma, redis, cache, redisStore };
}

describe('PublishSchedulerService (B-04)', () => {
  const now = new Date('2026-10-29T12:00:00Z');

  it('looks at ]lastRun, now], invalidates each series once plus the home, and stores the run', async () => {
    const last = new Date('2026-10-29T11:59:00Z');
    const { service, prisma, cache, redisStore } = makeService(String(last.getTime()));

    const flip = await service.runOnce(now);

    expect(prisma.series.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'PUBLISHED', publishedAt: { gt: last, lte: now } },
      }),
    );
    expect(prisma.episode.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          transcodeStatus: 'READY',
          publishedAt: { gt: last, lte: now },
          series: { status: 'PUBLISHED' },
        }),
      }),
    );
    expect(flip).toEqual({ seriesIds: ['s1', 's2'], episodeIds: ['e1', 'e2'] });
    expect(cache.invalidateSeries).toHaveBeenCalledTimes(2);
    expect(cache.invalidateSeries).toHaveBeenCalledWith('s1', false);
    expect(cache.invalidateHome).toHaveBeenCalledTimes(1);
    expect(redisStore.get(PUBLISH_LAST_RUN_KEY)).toBe(String(now.getTime()));
  });

  it('falls back to a 10-minute catch-up window on the first run', async () => {
    const { service, prisma } = makeService(null);
    await service.runOnce(now);
    const where = (
      prisma.series.findMany.mock.calls[0]?.[0] as { where: { publishedAt: { gt: Date } } }
    ).where;
    expect(where.publishedAt.gt).toEqual(new Date('2026-10-29T11:50:00Z'));
  });

  it('does nothing to the cache when nothing became visible', async () => {
    const { service, prisma, cache } = makeService(null);
    prisma.series.findMany.mockResolvedValue([]);
    prisma.episode.findMany.mockResolvedValue([]);
    await expect(service.runOnce(now)).resolves.toEqual({ seriesIds: [], episodeIds: [] });
    expect(cache.invalidateSeries).not.toHaveBeenCalled();
    expect(cache.invalidateHome).not.toHaveBeenCalled();
  });
});

describe('publishedSeriesWhere (scheduled publication)', () => {
  it('requires the publication date to be reached', () => {
    const now = new Date('2026-10-29T12:00:00Z');
    expect(publishedSeriesWhere({}, now)).toEqual({
      status: 'PUBLISHED',
      publishedAt: { lte: now },
    });
    expect(publishedSeriesWhere({ country: 'TG' }, now).OR).toHaveLength(2);
  });
});
