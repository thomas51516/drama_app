import { BadRequestException, ConflictException } from '@nestjs/common';
import { type AuthenticatedAdmin } from '../../common/request-context.js';
import {
  AdminHomeService,
  assertRowShape,
  assertSameSet,
  assertWindow,
  normalizeTitles,
} from './admin-home.service.js';

const admin: AuthenticatedAdmin = {
  id: 'adm',
  email: 'editor@drama.local',
  displayName: 'E',
  role: 'EDITOR',
  jti: 'j',
  exp: 0,
};

function makeService(rows: Array<Record<string, unknown>> = []) {
  const state = new Map(rows.map((r) => [r.id as string, { ...r }]));
  const homeRow = {
    findMany: vi.fn(() => Promise.resolve([...state.values()])),
    findUnique: vi.fn(({ where }: { where: { id?: string; key?: string } }) =>
      Promise.resolve(
        where.id
          ? (state.get(where.id) ?? null)
          : ([...state.values()].find((r) => r.key === where.key) ?? null),
      ),
    ),
    aggregate: vi.fn(() =>
      Promise.resolve({
        _max: { position: Math.max(0, ...[...state.values()].map((r) => r.position as number)) },
      }),
    ),
    create: vi.fn(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'row-new', createdAt: new Date(), updatedAt: new Date(), ...data }),
    ),
    update: vi.fn(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const next = { ...state.get(where.id), ...data, updatedAt: new Date() };
      state.set(where.id, next);
      return Promise.resolve(next);
    }),
    delete: vi.fn(() => Promise.resolve()),
  };
  const prisma = {
    homeRow,
    homeBanner: { findMany: vi.fn(() => Promise.resolve([])) },
    series: {
      findMany: vi.fn(({ where }: { where: { id: { in: string[] } } }) =>
        Promise.resolve(where.id.in.filter((id) => id !== 'missing').map((id) => ({ id }))),
      ),
    },
    $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn({ homeRow })),
  };
  const audit = { record: vi.fn(() => Promise.resolve()) };
  const cache = { invalidateHome: vi.fn(() => Promise.resolve(1)) };
  const home = { getHome: vi.fn(() => Promise.resolve({ banners: [], rows: [] })) };
  const service = new AdminHomeService(
    prisma as never,
    audit as never,
    cache as never,
    home as never,
  );
  return { service, prisma, audit, cache, home, homeRow };
}

function row(key: string, partial: Record<string, unknown> = {}) {
  return {
    id: `row-${key}`,
    key,
    type: 'NEW',
    titles: { fr: key },
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

describe('home configuration rules', () => {
  it('requires a genre for GENRE rows and series for MANUAL rows', () => {
    expect(() => assertRowShape('GENRE', null, [])).toThrow(BadRequestException);
    expect(() => assertRowShape('MANUAL', null, [])).toThrow(BadRequestException);
    expect(assertRowShape('GENRE', 'romance', ['s1'])).toEqual({ genre: 'romance', seriesIds: [] });
    expect(assertRowShape('MANUAL', 'romance', ['s1', 's1', 's2'])).toEqual({
      genre: null,
      seriesIds: ['s1', 's2'],
    });
    expect(assertRowShape('TRENDING', 'romance', ['s1'])).toEqual({ genre: null, seriesIds: [] });
  });

  it('validates the banner window and the reorder set', () => {
    expect(() => assertWindow('2026-11-02T00:00:00Z', '2026-11-01T00:00:00Z')).toThrow(
      BadRequestException,
    );
    expect(assertWindow(null, '2026-11-01T00:00:00Z').endsAt?.toISOString()).toBe(
      '2026-11-01T00:00:00.000Z',
    );
    expect(() => assertSameSet(['a', 'b'], ['a'], 'x')).toThrow(BadRequestException);
    expect(() => assertSameSet(['a'], ['a', 'z'], 'x')).toThrow(BadRequestException);
    expect(() => assertSameSet(['a', 'b'], ['b', 'a'], 'x')).not.toThrow();
  });

  it('keeps fr mandatory and drops empty translations', () => {
    expect(normalizeTitles({ fr: 'Tendances', en: '', es: null, pt: 'Tendências' })).toEqual({
      fr: 'Tendances',
      pt: 'Tendências',
    });
  });
});

describe('AdminHomeService rows', () => {
  it('creates a row at the last position, audits it and invalidates the home cache', async () => {
    const { service, audit, cache } = makeService([row('trending', { position: 3 })]);
    const created = await service.createRow(
      {
        key: 'genre-romance',
        type: 'GENRE',
        titles: { fr: 'Romance', en: 'Romance' },
        genre: 'romance',
      },
      admin,
      '::1',
    );
    expect(created).toMatchObject({
      key: 'genre-romance',
      type: 'GENRE',
      genre: 'romance',
      position: 4,
      titles: { fr: 'Romance', en: 'Romance', es: null, pt: null },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'home_row.create', targetType: 'home_row', ip: '::1' }),
      expect.anything(),
    );
    expect(cache.invalidateHome).toHaveBeenCalledTimes(1);
  });

  it('rejects duplicate keys and unknown series', async () => {
    const { service } = makeService([row('trending')]);
    await expect(
      service.createRow({ key: 'trending', type: 'NEW', titles: { fr: 'x' } }, admin),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.createRow(
        { key: 'picks', type: 'MANUAL', titles: { fr: 'x' }, seriesIds: ['missing'] },
        admin,
      ),
    ).rejects.toMatchObject({ response: { code: 'SERIES_NOT_FOUND' } });
  });

  it('re-validates the shape when the type changes on update', async () => {
    const { service } = makeService([row('trending', { type: 'TRENDING' })]);
    await expect(service.updateRow('row-trending', { type: 'GENRE' }, admin)).rejects.toMatchObject(
      {
        response: { code: 'HOME_ROW_GENRE_REQUIRED' },
      },
    );
    const updated = await service.updateRow(
      'row-trending',
      { type: 'GENRE', genre: 'Drame', isActive: false },
      admin,
    );
    expect(updated).toMatchObject({ type: 'GENRE', genre: 'drame', isActive: false });
  });

  it('reorders rows 1..n, audits old/new positions and skips a no-op order', async () => {
    const { service, homeRow, audit, cache } = makeService([
      row('a', { position: 1 }),
      row('b', { position: 2 }),
    ]);
    await service.reorderRows({ ids: ['row-a', 'row-b'] }, admin);
    expect(homeRow.update).not.toHaveBeenCalled();

    const reordered = await service.reorderRows({ ids: ['row-b', 'row-a'] }, admin);
    expect(reordered.map((r) => [r.key, r.position])).toEqual(
      expect.arrayContaining([
        ['b', 1],
        ['a', 2],
      ]),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'home_row.reorder',
        newValue: [
          { id: 'row-b', position: 1 },
          { id: 'row-a', position: 2 },
        ],
      }),
      expect.anything(),
    );
    expect(cache.invalidateHome).toHaveBeenCalled();
    await expect(service.reorderRows({ ids: ['row-a'] }, admin)).rejects.toMatchObject({
      response: { code: 'HOME_ORDER_MISMATCH' },
    });
  });

  it('preview bypasses the cache and simulates an anonymous viewer', async () => {
    const { service, home } = makeService();
    await service.preview({ country: 'TG', lang: 'en' });
    expect(home.getHome).toHaveBeenCalledWith({ country: 'TG', lang: 'en' }, { fresh: true });
  });
});
