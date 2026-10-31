import { NotFoundException } from '@nestjs/common';
import {
  AdminStatsService,
  PAYWALL_CONVERSION_WINDOW_HOURS,
  STATS_CACHE_TTL_SECONDS,
  statsCacheKey,
} from './admin-stats.service.js';

describe('AdminStatsService (B-11)', () => {
  const now = new Date('2026-10-29T12:00:00Z');

  function makeService() {
    const queryRaw = vi
      .fn()
      .mockResolvedValueOnce([{ d1: 3, d7: 10, d30: 25 }])
      .mockResolvedValueOnce([{ new_users: 4, registered_users: 6, guest_users: 20 }])
      .mockResolvedValueOnce([{ started: 50, completed: 12 }])
      .mockResolvedValueOnce([
        { series_id: 's1', title: 'Le Secret du Lagon', viewers: 9, completions: 7 },
      ])
      .mockResolvedValueOnce([{ paywall_views: 15, push_opens: 4 }])
      .mockResolvedValueOnce([{ unlocks: 8 }])
      .mockResolvedValueOnce([
        { provider: 'MOBILE_MONEY', currency: 'XOF', amount_minor: 150_000, order_count: 3 },
      ])
      .mockResolvedValueOnce([{ viewers_count: 15, converted_count: 5 }]);
    const cache = {
      remember: vi.fn((_k: string, _ttl: number, compute: () => Promise<unknown>) => compute()),
    };
    const service = new AdminStatsService({ $queryRaw: queryRaw } as never, cache as never);
    return { service, queryRaw, cache };
  }

  it('returns the contract shape from the eight SQL aggregates', async () => {
    const { service, queryRaw } = makeService();
    const result = await service.compute(7, now);
    expect(queryRaw).toHaveBeenCalledTimes(8);
    expect(result).toEqual({
      activeUsers: { d1: 3, d7: 10, d30: 25 },
      newUsers: 4,
      registeredUsers: 6,
      guestUsers: 20,
      episodesStarted: 50,
      episodesCompleted: 12,
      topSeries: [{ seriesId: 's1', title: 'Le Secret du Lagon', viewers: 9, completions: 7 }],
      paywallViews: 15,
      unlocks: 8,
      pushOpens: 4,
      revenueBySource: [
        { source: 'MOBILE_MONEY', currency: 'XOF', amountMinor: 150_000, orderCount: 3 },
      ],
      paywallConversion: {
        paywallViewers: 15,
        convertedViewers: 5,
        conversionRate: 5 / 15,
        windowHours: PAYWALL_CONVERSION_WINDOW_HOURS,
      },
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

  it('tolerates empty result sets, conversion rate is 0 with no viewers', async () => {
    const cache = { remember: vi.fn((_k: string, _t: number, c: () => Promise<unknown>) => c()) };
    const service = new AdminStatsService(
      { $queryRaw: vi.fn(() => Promise.resolve([])) } as never,
      cache as never,
    );
    const result = await service.compute(1, now);
    expect(result.activeUsers).toEqual({ d1: 0, d7: 0, d30: 0 });
    expect(result.topSeries).toEqual([]);
    expect(result.revenueBySource).toEqual([]);
    expect(result.paywallConversion).toEqual({
      paywallViewers: 0,
      convertedViewers: 0,
      conversionRate: 0,
      windowHours: PAYWALL_CONVERSION_WINDOW_HOURS,
    });
  });
});

describe('AdminStatsService.retention (B-11)', () => {
  const now = new Date('2026-10-31T00:00:00Z');

  it('404s when seriesId does not match any series', async () => {
    const prisma = { series: { findUnique: vi.fn(() => Promise.resolve(null)) } };
    const service = new AdminStatsService(prisma as never, {} as never);
    await expect(service.retention('missing', now)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('computes the retention curve as viewers(N) / viewers(1) * 100', async () => {
    const queryRaw = vi.fn(() =>
      Promise.resolve([
        { number: 1, viewers: 100 },
        { number: 2, viewers: 80 },
        { number: 3, viewers: 40 },
      ]),
    );
    const prisma = {
      series: { findUnique: vi.fn(() => Promise.resolve({ id: 's1' })) },
      $queryRaw: queryRaw,
    };
    const service = new AdminStatsService(prisma as never, {} as never);
    const result = await service.retention('s1', now);
    expect(result.seriesId).toBe('s1');
    expect(result.cohortSize).toBe(100);
    expect(result.points).toEqual([
      { episodeNumber: 1, viewers: 100, retentionPercent: 100 },
      { episodeNumber: 2, viewers: 80, retentionPercent: 80 },
      { episodeNumber: 3, viewers: 40, retentionPercent: 40 },
    ]);
  });

  it('combines cohorts across the whole catalogue without a seriesId, skipping the series check', async () => {
    const seriesFindUnique = vi.fn();
    const queryRaw = vi.fn(() => Promise.resolve([{ number: 1, viewers: 0 }]));
    const prisma = { series: { findUnique: seriesFindUnique }, $queryRaw: queryRaw };
    const service = new AdminStatsService(prisma as never, {} as never);
    const result = await service.retention(undefined, now);
    expect(seriesFindUnique).not.toHaveBeenCalled();
    expect(result.seriesId).toBeNull();
    expect(result.cohortSize).toBe(0);
    expect(result.points[0]?.retentionPercent).toBe(0);
  });
});
