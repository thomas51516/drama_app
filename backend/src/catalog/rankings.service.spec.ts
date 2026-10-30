import { RankingsService } from './rankings.service.js';

const now = new Date('2026-10-30T12:00:00Z');
const series = (id: string, genres: string[]) => ({
  id,
  slug: id,
  title: id,
  genres,
  posterVerticalUrl: null,
  posterHorizontalUrl: null,
  freeEpisodeCount: 2,
  coinCostPerEpisode: 10,
  ageRating: 'ALL',
  publishedAt: now,
  _count: { episodes: 3 },
});

function makeService(opts: {
  ranking: { series_id: string; viewers: number }[];
  found: unknown[];
}) {
  const since: Date[] = [];
  const prisma = {
    $queryRaw: vi.fn((_sql: unknown, arg: Date) => {
      since.push(arg);
      return Promise.resolve(opts.ranking);
    }),
    series: { findMany: vi.fn(() => Promise.resolve(opts.found)) },
  };
  const store = new Map<string, unknown>();
  const cache = {
    remember: vi.fn(async (key: string, _ttl: number, compute: () => Promise<unknown>) => {
      if (!store.has(key)) store.set(key, await compute());
      return store.get(key);
    }),
  };
  const personalization = {
    decorate: vi.fn((userId: string | undefined, items: unknown[]) =>
      Promise.resolve(userId ? items.map((i) => ({ ...(i as object), isFavorite: true })) : items),
    ),
  };
  const service = new RankingsService(prisma as never, cache as never, personalization as never);
  return { service, prisma, cache, personalization, since };
}

describe('RankingsService (M-04)', () => {
  it('ranks by distinct viewers, keeps only visible series and numbers the ranks', async () => {
    const { service, since } = makeService({
      ranking: [
        { series_id: 'b', viewers: 9 },
        { series_id: 'hidden', viewers: 5 },
        { series_id: 'a', viewers: 2 },
      ],
      found: [series('a', ['drame']), series('b', ['romance'])],
    });
    const out = await service.rankings('week', undefined, { country: 'TG' }, now);
    expect(out.period).toBe('week');
    expect(out.items.map((i) => [i.rank, i.series.id, i.viewers])).toEqual([
      [1, 'b', 9],
      [2, 'a', 2],
    ]);
    expect(since[0]?.toISOString()).toBe('2026-10-23T12:00:00.000Z');
  });

  it('filters by canonical genre and uses the whole history for period=all', async () => {
    const { service, prisma, since } = makeService({
      ranking: [{ series_id: 'a', viewers: 1 }],
      found: [series('a', ['comédie'])],
    });
    await service.rankings('all', 'Comedy', { country: null }, now);
    const args = prisma.series.findMany.mock.calls[0][0] as { where: { genres: { has: string } } };
    expect(args.where.genres).toEqual({ has: 'comédie' });
    expect(since[0]?.getTime()).toBe(0);
  });

  it('caches per period, genre and country and personalizes after the cache', async () => {
    const { service, cache, personalization } = makeService({
      ranking: [{ series_id: 'a', viewers: 1 }],
      found: [series('a', [])],
    });
    await service.rankings('day', undefined, { country: 'TG' }, now);
    const out = await service.rankings('day', undefined, { country: 'TG', userId: 'u1' }, now);
    expect(cache.remember).toHaveBeenCalledWith(
      'cache:v1:rankings:day:*:TG',
      600,
      expect.any(Function),
    );
    expect(out.items[0]?.series).toMatchObject({ isFavorite: true });
    expect(personalization.decorate).toHaveBeenCalledTimes(2);
  });
});
