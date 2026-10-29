import { AppConfig } from '../config/app-config.js';
import { type Env } from '../config/env.schema.js';
import { NO_ENTITLEMENTS } from './entitlement.service.js';
import { HomeService, matchesCountry, pickTitle } from './home.service.js';

const config = new AppConfig({ CDN_BASE_URL: 'https://cdn.test/media' } as unknown as Env);

function series(id: string, partial: Record<string, unknown> = {}) {
  return {
    id,
    slug: id,
    title: `Série ${id}`,
    synopsis: '',
    genres: ['romance'],
    tags: [],
    originalLanguage: 'fr',
    posterVerticalUrl: null,
    posterHorizontalUrl: `https://img/${id}.jpg`,
    freeEpisodeCount: 2,
    coinCostPerEpisode: 10,
    status: 'PUBLISHED',
    territories: [],
    ageRating: 'ALL',
    publishedAt: new Date('2026-10-01T08:00:00Z'),
    createdAt: new Date(),
    updatedAt: new Date(),
    _count: { episodes: 3 },
    ...partial,
  };
}

function row(key: string, type: string, partial: Record<string, unknown> = {}) {
  return {
    id: `row-${key}`,
    key,
    type,
    titles: { fr: `${key} fr`, en: `${key} en` },
    genre: null,
    seriesIds: [],
    countries: [],
    position: 1,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  };
}

function makeService(opts: {
  rows?: ReturnType<typeof row>[];
  banners?: Array<Record<string, unknown>>;
  ranking?: Array<{ series_id: string; viewers: number }>;
  cacheHit?: unknown;
}) {
  const prisma = {
    homeRow: { findMany: vi.fn(() => Promise.resolve(opts.rows ?? [])) },
    homeBanner: { findMany: vi.fn(() => Promise.resolve(opts.banners ?? [])) },
    series: { findMany: vi.fn(() => Promise.resolve([series('s1'), series('s2')])) },
    watchProgress: { findMany: vi.fn(() => Promise.resolve([])) },
    $queryRaw: vi.fn(() => Promise.resolve(opts.ranking ?? [])),
  };
  const entitlements = { forViewer: vi.fn(() => Promise.resolve(NO_ENTITLEMENTS)) };
  const cache = {
    remember: vi.fn(
      (_key: string, _ttl: number, compute: () => Promise<unknown>, fresh?: boolean) =>
        opts.cacheHit !== undefined && !fresh ? Promise.resolve(opts.cacheHit) : compute(),
    ),
  };
  const service = new HomeService(prisma as never, entitlements as never, cache as never, config);
  return { service, prisma, cache, entitlements };
}

describe('matchesCountry / pickTitle', () => {
  it('applies the country filter only when both sides are known', () => {
    expect(matchesCountry([], 'TG')).toBe(true);
    expect(matchesCountry(['TG', 'CI'], 'TG')).toBe(true);
    expect(matchesCountry(['TG', 'CI'], 'FR')).toBe(false);
    expect(matchesCountry(['TG'], null)).toBe(true);
  });

  it('picks the requested language, then fr, then any, then the key', () => {
    const titles = { fr: 'Tendances', en: 'Trending', es: null };
    expect(pickTitle(titles, 'en', 'k')).toBe('Trending');
    expect(pickTitle(titles, 'es', 'k')).toBe('Tendances');
    expect(pickTitle(titles, 'pt', 'k')).toBe('Tendances');
    expect(pickTitle({ en: 'Only EN' }, 'fr', 'k')).toBe('Only EN');
    expect(pickTitle(null, 'fr', 'k')).toBe('k');
  });
});

describe('HomeService.getHome', () => {
  it('builds rows in configured order, titled in the viewer language, and resolves banners', async () => {
    const { service, prisma, cache } = makeService({
      rows: [
        row('trending', 'TRENDING', { position: 1 }),
        row('new', 'NEW', { position: 2 }),
        row('genre-romance', 'GENRE', { position: 3, genre: 'romance' }),
      ],
      banners: [
        {
          id: 'b1',
          seriesId: 's1',
          imageUrl: null,
          title: 'À la une',
          subtitle: null,
          countries: [],
          position: 1,
          series: series('s1'),
        },
      ],
      ranking: [{ series_id: 's2', viewers: 5 }],
    });

    const home = await service.getHome({ country: 'TG', lang: 'en' });

    expect(cache.remember).toHaveBeenCalledWith(
      'cache:v1:home:TG:en',
      60,
      expect.any(Function),
      undefined,
    );
    expect(home.rows.map((r) => [r.key, r.type, r.title])).toEqual([
      ['trending', 'TRENDING', 'trending en'],
      ['new', 'NEW', 'new en'],
      ['genre-romance', 'GENRE', 'genre-romance en'],
    ]);
    expect(home.banners).toEqual([
      expect.objectContaining({
        bannerId: 'b1',
        id: 's1',
        imageUrl: 'https://img/s1.jpg',
        bannerTitle: 'À la une',
      }),
    ]);
    // GENRE : filtre `genres has` + territoire du spectateur.
    expect(prisma.series.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'PUBLISHED',
          genres: { has: 'romance' },
          OR: [{ territories: { isEmpty: true } }, { territories: { has: 'TG' } }],
        }),
      }),
    );
    // TRENDING : classement sur 7 jours puis complément par les nouveautés.
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    const trendingCall = prisma.series.findMany.mock.calls.find((c) => {
      const where = (c[0] as { where: { id?: { in?: string[] } } }).where;
      return where.id?.in?.includes('s2');
    });
    expect(trendingCall).toBeDefined();
  });

  it('ranks trending series by distinct viewers and keeps MANUAL order', async () => {
    const { service, prisma } = makeService({
      rows: [
        row('trending', 'TRENDING'),
        row('picks', 'MANUAL', { seriesIds: ['s2', 's1', 'missing'] }),
      ],
      ranking: [
        { series_id: 's2', viewers: 9 },
        { series_id: 's1', viewers: 3 },
      ],
    });
    prisma.series.findMany.mockImplementation(
      (args: { where: { id?: { in?: string[]; notIn?: string[] } } }) => {
        if (args.where.id?.in) {
          return Promise.resolve(
            args.where.id.in.flatMap((id) => (id === 'missing' ? [] : [series(id)])),
          );
        }
        return Promise.resolve([series('s3')]);
      },
    );

    const home = await service.getHome({ lang: 'fr' });

    expect(home.rows[0]?.items.map((i) => i.series.id)).toEqual(['s2', 's1', 's3']);
    expect(home.rows[1]?.items.map((i) => i.series.id)).toEqual(['s2', 's1']);
  });

  it('skips rows and banners restricted to other countries, keeps them when the country is unknown', async () => {
    const rows = [
      row('everywhere', 'NEW', { countries: [] }),
      row('togo-only', 'NEW', { countries: ['TG'] }),
    ];
    const { service: tg } = makeService({ rows });
    expect((await tg.getHome({ country: 'TG', lang: 'fr' })).rows.map((r) => r.key)).toEqual([
      'everywhere',
      'togo-only',
    ]);
    const { service: ci } = makeService({ rows });
    expect((await ci.getHome({ country: 'CI', lang: 'fr' })).rows.map((r) => r.key)).toEqual([
      'everywhere',
    ]);
    const { service: unknown } = makeService({ rows });
    expect((await unknown.getHome({ lang: 'fr' })).rows.map((r) => r.key)).toEqual([
      'everywhere',
      'togo-only',
    ]);
  });

  it('drops empty rows and the continue-watching row for anonymous viewers', async () => {
    const { service, prisma } = makeService({
      rows: [row('continue_watching', 'CONTINUE_WATCHING'), row('new', 'NEW')],
    });
    prisma.series.findMany.mockResolvedValue([]);
    const home = await service.getHome({ lang: 'fr' });
    expect(home.rows).toEqual([]);
    expect(prisma.watchProgress.findMany).not.toHaveBeenCalled();
  });

  it('fills continue-watching after the cache for an authenticated viewer, at its configured position', async () => {
    const cached = {
      banners: [],
      rows: [
        {
          key: 'trending',
          type: 'TRENDING',
          title: 'Tendances',
          items: [{ series: { id: 's1' } }],
        },
        { key: 'continue_watching', type: 'CONTINUE_WATCHING', title: 'Reprendre', items: [] },
        { key: 'new', type: 'NEW', title: 'Nouveautés', items: [{ series: { id: 's2' } }] },
      ],
    };
    const { service, prisma } = makeService({ cacheHit: cached });
    prisma.watchProgress.findMany.mockResolvedValue([
      {
        episodeId: 'e3',
        positionSeconds: 42,
        episode: {
          id: 'e3',
          seriesId: 's1',
          number: 3,
          title: 'Trois',
          durationSeconds: 90,
          thumbnailUrl: null,
          publishedAt: new Date(),
          subtitles: [{ language: 'fr', fileUrl: 'subtitles/e3/fr.vtt' }],
          series: series('s1'),
        },
      },
    ]);

    const anonymous = await service.getHome({ lang: 'fr' });
    expect(anonymous.rows.map((r) => r.key)).toEqual(['trending', 'new']);

    const home = await service.getHome({ userId: 'u1', lang: 'fr' });
    expect(home.rows.map((r) => r.key)).toEqual(['trending', 'continue_watching', 'new']);
    expect(home.rows[1]?.items[0]).toMatchObject({
      positionSeconds: 42,
      episode: {
        id: 'e3',
        access: 'locked',
        coinCost: 10,
        subtitles: [
          { language: 'fr', label: 'Français', url: 'https://cdn.test/media/subtitles/e3/fr.vtt' },
        ],
      },
    });
    expect(prisma.homeRow.findMany).not.toHaveBeenCalled();
  });
});
