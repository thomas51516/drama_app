import {
  AdminStatsService,
  STATS_CACHE_TTL_SECONDS,
  statsCacheKey,
} from './admin-stats.service.js';

describe('AdminStatsService (B-11 v0)', () => {
  const now = new Date('2026-10-29T12:00:00Z');

  function makeService() {
    const queryRaw = vi
      .fn()
      .mockResolvedValueOnce([{ d1: 3, d7: 10, d30: 25 }])
      .mockResolvedValueOnce([{ new_users: 4, registered_users: 6, guest_users: 20 }])
      .mockResolvedValueOnce([{ started: 50, completed: 12 }])
      .mockResolvedValueOnce([
        { series_id: 's1', title: 'Le Secret du Lagon', viewers: 9, completions: 7 },
      ]);
    const cache = {
      remember: vi.fn((_k: string, _ttl: number, compute: () => Promise<unknown>) => compute()),
    };
    const service = new AdminStatsService({ $queryRaw: queryRaw } as never, cache as never);
    return { service, queryRaw, cache };
  }

  it('returns the contract shape from the four SQL aggregates', async () => {
    const { service, queryRaw } = makeService();
    const result = await service.compute(7, now);
    expect(queryRaw).toHaveBeenCalledTimes(4);
    expect(result).toEqual({
      activeUsers: { d1: 3, d7: 10, d30: 25 },
      newUsers: 4,
      registeredUsers: 6,
      guestUsers: 20,
      episodesStarted: 50,
      episodesCompleted: 12,
      topSeries: [{ seriesId: 's1', title: 'Le Secret du Lagon', viewers: 9, completions: 7 }],
      days: 7,
      generatedAt: '2026-10-29T12:00:00.000Z',
    });
  });

  it('caches the overview 5 minutes per window', async () => {
    const { service, cache } = makeService();
    await service.overview(30, now);
    expect(cache.remember).toHaveBeenCalledWith(
      statsCacheKey(30),
      STATS_CACHE_TTL_SECONDS,
      expect.any(Function),
    );
    expect(STATS_CACHE_TTL_SECONDS).toBe(300);
  });

  it('tolerates empty result sets', async () => {
    const cache = { remember: vi.fn((_k: string, _t: number, c: () => Promise<unknown>) => c()) };
    const service = new AdminStatsService(
      { $queryRaw: vi.fn(() => Promise.resolve([])) } as never,
      cache as never,
    );
    const result = await service.compute(1, now);
    expect(result.activeUsers).toEqual({ d1: 0, d7: 0, d30: 0 });
    expect(result.topSeries).toEqual([]);
  });
});
