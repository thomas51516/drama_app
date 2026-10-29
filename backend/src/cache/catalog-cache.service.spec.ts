import { CatalogCacheService } from './catalog-cache.service.js';

function makeCache() {
  const store = new Map<string, string>();
  const client = {
    get: vi.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    set: vi.fn((key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve('OK');
    }),
    scan: vi.fn((_cursor: string, _m: string, pattern: string) => {
      const regex = new RegExp(
        `^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`,
      );
      return Promise.resolve(['0', [...store.keys()].filter((k) => regex.test(k))]);
    }),
    del: vi.fn((...keys: string[]) => {
      let n = 0;
      for (const k of keys) if (store.delete(k)) n += 1;
      return Promise.resolve(n);
    }),
  };
  const cache = new CatalogCacheService({ client } as never);
  return { cache, client, store };
}

describe('CatalogCacheService', () => {
  it('remember() computes once, then serves the cached value with the TTL', async () => {
    const { cache, client } = makeCache();
    const compute = vi.fn(() => Promise.resolve({ rows: [1] }));
    const key = CatalogCacheService.homeKey('TG', 'fr');

    expect(await cache.remember(key, 60, compute)).toEqual({ rows: [1] });
    expect(await cache.remember(key, 60, compute)).toEqual({ rows: [1] });
    expect(compute).toHaveBeenCalledTimes(1);
    expect(client.set).toHaveBeenCalledWith(key, JSON.stringify({ rows: [1] }), 'EX', 60);
  });

  it('remember(fresh) bypasses the cache without writing it', async () => {
    const { cache, client } = makeCache();
    const compute = vi.fn(() => Promise.resolve('fresh'));
    await cache.remember('cache:v1:home:*:fr', 60, compute, true);
    expect(client.get).not.toHaveBeenCalled();
    expect(client.set).not.toHaveBeenCalled();
  });

  it('builds keys per country and language, with * for unknown country', () => {
    expect(CatalogCacheService.homeKey(null, 'en')).toBe('cache:v1:home:*:en');
    expect(CatalogCacheService.homeKey('CI', 'fr')).toBe('cache:v1:home:CI:fr');
    expect(CatalogCacheService.seriesKey('s1', 'episodes', undefined)).toBe(
      'cache:v1:series:s1:episodes:*',
    );
  });

  it('invalidateSeries() removes the series variants and the home; invalidateHome() only the home', async () => {
    const { cache, store } = makeCache();
    await cache.set(CatalogCacheService.homeKey('TG', 'fr'), 1, 60);
    await cache.set(CatalogCacheService.homeKey(null, 'en'), 1, 60);
    await cache.set(CatalogCacheService.seriesKey('s1', 'detail', 'TG'), 1, 120);
    await cache.set(CatalogCacheService.seriesKey('s1', 'episodes', null), 1, 120);
    await cache.set(CatalogCacheService.seriesKey('s2', 'detail', null), 1, 120);

    expect(await cache.invalidateSeries('s1')).toBe(4);
    expect([...store.keys()]).toEqual(['cache:v1:series:s2:detail:*']);

    await cache.set(CatalogCacheService.homeKey('TG', 'fr'), 1, 60);
    expect(await cache.invalidateHome()).toBe(1);
    expect([...store.keys()]).toEqual(['cache:v1:series:s2:detail:*']);
  });

  it('fails open when Redis is down', async () => {
    const client = {
      get: vi.fn(() => Promise.reject(new Error('ECONNREFUSED'))),
      set: vi.fn(() => Promise.reject(new Error('ECONNREFUSED'))),
      scan: vi.fn(() => Promise.reject(new Error('ECONNREFUSED'))),
    };
    const cache = new CatalogCacheService({ client } as never);
    expect(await cache.remember('k', 10, () => Promise.resolve(42))).toBe(42);
    expect(await cache.invalidateHome()).toBe(0);
  });
});
