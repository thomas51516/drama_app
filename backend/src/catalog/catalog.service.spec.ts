import { NotFoundException } from '@nestjs/common';
import { AppConfig } from '../config/app-config.js';
import { type Env } from '../config/env.schema.js';
import { CatalogService } from './catalog.service.js';
import { computeAccess, NO_ENTITLEMENTS } from './entitlement.service.js';

const config = new AppConfig({ CDN_BASE_URL: 'https://cdn.test/media' } as unknown as Env);

const SERIES_ID = '0192f1f0-8a5b-7c3d-9e1f-00000000aaaa';

function fakeSeries(partial: Record<string, unknown> = {}) {
  return {
    id: SERIES_ID,
    slug: 'le-secret-du-lagon',
    title: 'Le Secret du Lagon',
    synopsis: 'Synopsis',
    genres: ['romance', 'drame'],
    tags: [],
    originalLanguage: 'fr',
    posterVerticalUrl: null,
    posterHorizontalUrl: null,
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

function fakeEpisode(number: number) {
  return {
    id: `ep-${number}`,
    seriesId: SERIES_ID,
    number,
    title: `Episode ${number}`,
    durationSeconds: 90,
    transcodeStatus: 'READY',
    sourceKey: null,
    hlsKey: `hls/${number}/master.m3u8`,
    thumbnailUrl: null,
    previewKey: null,
    publishedAt: new Date('2026-10-02T08:00:00Z'),
    createdAt: new Date(),
    updatedAt: new Date(),
    subtitles: [{ language: 'fr' }],
  };
}

function makeService() {
  const prisma = {
    user: { findUnique: vi.fn() },
    series: { findMany: vi.fn(), count: vi.fn(), findFirst: vi.fn() },
    episode: { findMany: vi.fn() },
    watchProgress: { findMany: vi.fn(() => Promise.resolve([])) },
  };
  const entitlements = { forViewer: vi.fn(() => Promise.resolve(NO_ENTITLEMENTS)) };
  const service = new CatalogService(prisma as never, entitlements as never, config);
  return { service, prisma, entitlements };
}

describe('computeAccess', () => {
  const series = { freeEpisodeCount: 2 };

  it('marks the first episodes free regardless of the viewer', () => {
    expect(computeAccess({ id: 'a', number: 1 }, series, NO_ENTITLEMENTS)).toBe('free');
    expect(computeAccess({ id: 'a', number: 2 }, series, NO_ENTITLEMENTS)).toBe('free');
  });

  it('locks later episodes for anonymous viewers', () => {
    expect(computeAccess({ id: 'a', number: 3 }, series, NO_ENTITLEMENTS)).toBe('locked');
  });

  it('unlocks for VIP members and for explicitly unlocked episodes', () => {
    expect(
      computeAccess({ id: 'a', number: 3 }, series, {
        isVip: true,
        unlocked: new Set(),
        country: null,
      }),
    ).toBe('unlocked');
    expect(
      computeAccess({ id: 'a', number: 3 }, series, {
        isVip: false,
        unlocked: new Set(['a']),
        country: null,
      }),
    ).toBe('unlocked');
    expect(
      computeAccess({ id: 'b', number: 3 }, series, {
        isVip: false,
        unlocked: new Set(['a']),
        country: null,
      }),
    ).toBe('locked');
  });
});

describe('CatalogService.listSeries', () => {
  it('only lists published series, applies the genre filter and pagination', async () => {
    const { service, prisma } = makeService();
    prisma.series.findMany.mockResolvedValue([fakeSeries()]);
    prisma.series.count.mockResolvedValue(41);

    const result = await service.listSeries({ genre: 'Romance', page: 3, pageSize: 20 }, {});

    expect(prisma.series.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'PUBLISHED', genres: { has: 'romance' } },
        skip: 40,
        take: 20,
      }),
    );
    expect(result).toMatchObject({ page: 3, pageSize: 20, total: 41 });
    expect(result.items[0]).toMatchObject({
      id: SERIES_ID,
      episodeCount: 3,
      freeEpisodeCount: 2,
      coinCostPerEpisode: 10,
      publishedAt: '2026-10-01T08:00:00.000Z',
    });
  });

  it('restricts to the viewer territory when the country is known', async () => {
    const { service, prisma } = makeService();
    prisma.series.findMany.mockResolvedValue([]);
    prisma.series.count.mockResolvedValue(0);

    await service.listSeries({ page: 1, pageSize: 20 }, { userId: 'u1', country: 'TG' });

    expect(prisma.series.count).toHaveBeenCalledWith({
      where: {
        status: 'PUBLISHED',
        OR: [{ territories: { isEmpty: true } }, { territories: { has: 'TG' } }],
      },
    });
  });
});

describe('CatalogService.getSeries', () => {
  it('throws SERIES_NOT_FOUND for unknown or unpublished series', async () => {
    const { service, prisma } = makeService();
    prisma.series.findFirst.mockResolvedValue(null);
    await expect(service.getSeries(SERIES_ID, {})).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns the detail with synopsis and status', async () => {
    const { service, prisma } = makeService();
    prisma.series.findFirst.mockResolvedValue(fakeSeries());
    await expect(service.getSeries(SERIES_ID, {})).resolves.toMatchObject({
      synopsis: 'Synopsis',
      status: 'PUBLISHED',
      genres: ['romance', 'drame'],
    });
  });
});

describe('CatalogService.listEpisodes', () => {
  it('computes free / unlocked / locked per episode for the viewer', async () => {
    const { service, prisma, entitlements } = makeService();
    prisma.series.findFirst.mockResolvedValue({
      id: SERIES_ID,
      freeEpisodeCount: 2,
      coinCostPerEpisode: 10,
    });
    prisma.episode.findMany.mockResolvedValue([
      fakeEpisode(1),
      fakeEpisode(2),
      fakeEpisode(3),
      fakeEpisode(4),
    ]);
    entitlements.forViewer.mockResolvedValue({
      isVip: false,
      unlocked: new Set(['ep-3']),
      country: null,
    });

    const result = await service.listEpisodes(SERIES_ID, { userId: 'u1' });

    expect(entitlements.forViewer).toHaveBeenCalledWith('u1', ['ep-1', 'ep-2', 'ep-3', 'ep-4']);
    expect(result.map((e) => [e.number, e.access, e.coinCost])).toEqual([
      [1, 'free', 0],
      [2, 'free', 0],
      [3, 'unlocked', 0],
      [4, 'locked', 10],
    ]);
    expect(result[0]?.subtitleLanguages).toEqual(['fr']);
  });
});

describe('CatalogService.getHome', () => {
  it('builds trending, new and genre rows from published series', async () => {
    const { service, prisma } = makeService();
    prisma.series.findMany.mockResolvedValue([fakeSeries()]);

    const home = await service.getHome({});

    expect(home.banners).toHaveLength(1);
    expect(home.rows.map((r) => r.key)).toEqual([
      'trending',
      'new',
      'genre:romance',
      'genre:drame',
    ]);
    expect(home.rows[0]?.title).toBe('Tendances');
    expect(prisma.watchProgress.findMany).not.toHaveBeenCalled();
  });
});

describe('CatalogService.getFeed', () => {
  it('pages with an opaque cursor and resolves preview URLs against the CDN', async () => {
    const { service, prisma } = makeService();
    const episodes = [1, 2, 3].map((n) => ({
      ...fakeEpisode(1),
      id: `feed-${n}`,
      previewKey: `previews/${n}.m3u8`,
      series: fakeSeries({ id: `s-${n}` }),
    }));
    prisma.episode.findMany.mockResolvedValue(episodes);

    const page = await service.getFeed({ limit: 2 }, {});

    expect(prisma.episode.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 3 }),
    );
    expect(page.items).toHaveLength(2);
    expect(page.items[0]?.previewUrl).toBe('https://cdn.test/media/previews/1.m3u8');
    expect(page.nextCursor).not.toBeNull();

    prisma.episode.findMany.mockResolvedValue([episodes[2]]);
    const next = await service.getFeed({ limit: 2, cursor: page.nextCursor ?? undefined }, {});
    expect(prisma.episode.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ skip: 2, take: 3 }),
    );
    expect(next.nextCursor).toBeNull();
  });
});
