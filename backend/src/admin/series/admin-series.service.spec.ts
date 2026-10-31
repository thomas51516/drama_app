import { ConflictException, ForbiddenException } from '@nestjs/common';
import { type AuthenticatedAdmin } from '../../common/request-context.js';
import { AdminSeriesService } from './admin-series.service.js';
import { type AdminSeriesRecord } from './admin-series.mapper.js';

const admin = (role: AuthenticatedAdmin['role']): AuthenticatedAdmin => ({
  id: 'adm',
  email: `${role.toLowerCase()}@drama.local`,
  displayName: role,
  role,
  jti: 'j',
  exp: 0,
});

function series(partial: Partial<AdminSeriesRecord> = {}): AdminSeriesRecord {
  return {
    id: '0192f1f0-8a5b-7c3d-9e1f-00000000se01',
    slug: 'le-secret-du-lagon',
    title: 'Le Secret du Lagon',
    synopsis: 'x',
    genres: ['romance'],
    tags: [],
    originalLanguage: 'fr',
    posterVerticalUrl: null,
    posterHorizontalUrl: null,
    freeEpisodeCount: 5,
    coinCostPerEpisode: 10,
    adUnlockEnabled: true,
    status: 'DRAFT',
    territories: [],
    ageRating: 'ALL',
    likesCount: 0,
    publishedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    _count: { episodes: 2 },
    rightsContract: null,
    ...partial,
  };
}

function makeService(existing: AdminSeriesRecord | null, readyCount = 0) {
  const tx = {
    series: {
      create: vi.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(
          series({ ...(data as Partial<AdminSeriesRecord>), _count: { episodes: 0 } }),
        ),
      ),
      update: vi.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(series({ ...(existing ?? {}), ...(data as Partial<AdminSeriesRecord>) })),
      ),
    },
  };
  const prisma = {
    $transaction: vi.fn((cb: (t: typeof tx) => Promise<unknown>) => cb(tx)),
    series: {
      findUnique: vi.fn(({ where }: { where: { id?: string; slug?: string } }) =>
        Promise.resolve(where.slug ? (existing?.slug === where.slug ? existing : null) : existing),
      ),
      findMany: vi.fn(() => Promise.resolve(existing ? [existing] : [])),
      count: vi.fn(() => Promise.resolve(existing ? 1 : 0)),
    },
    episode: {
      count: vi.fn(() => Promise.resolve(readyCount)),
      updateMany: vi.fn(() => Promise.resolve({ count: readyCount })),
    },
  };
  const audit = { record: vi.fn(() => Promise.resolve()) };
  const cache = { invalidateSeries: vi.fn(() => Promise.resolve(0)) };
  const settings = {
    get: vi.fn(() => Promise.resolve({ defaultFreeEpisodes: 5, defaultCoinCost: 10 })),
  };
  const service = new AdminSeriesService(
    prisma as never,
    audit as never,
    cache as never,
    settings as never,
  );
  return { service, prisma, tx, audit, cache };
}

describe('AdminSeriesService.create', () => {
  it('derives the slug from the title and de-duplicates it, then audits the creation', async () => {
    const { service, tx, audit } = makeService(series());
    const created = await service.create(
      { title: 'Le Secret du Lagon', genres: ['romance'] },
      admin('EDITOR'),
      '10.0.0.1',
    );
    expect(tx.series.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ slug: 'le-secret-du-lagon-2' }) }),
    );
    expect(created.language).toBe('fr');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'series.create', targetType: 'series', ip: '10.0.0.1' }),
      tx,
    );
  });

  it('EDITOR cannot set monetisation fields, MONETIZATION cannot set anything else', async () => {
    const { service } = makeService(null);
    await expect(
      service.create({ title: 'X', freeEpisodeCount: 3 }, admin('EDITOR')),
    ).rejects.toMatchObject({
      response: { code: 'FORBIDDEN_FIELDS', details: { fields: ['freeEpisodeCount'] } },
    });
    await expect(
      service.update('id', { title: 'Y', coinCostPerEpisode: 12 }, admin('MONETIZATION')),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('AdminSeriesService.update', () => {
  it('records only the changed fields with old and new values', async () => {
    const { service, audit } = makeService(series());
    await service.update(
      '0192f1f0-8a5b-7c3d-9e1f-00000000se01',
      { title: 'Nouveau titre', genres: ['romance'] },
      admin('ADMIN'),
    );
    expect(audit.record).toHaveBeenCalledTimes(1);
    const entry = audit.record.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(entry).toMatchObject({
      action: 'series.update',
      oldValue: { title: 'Le Secret du Lagon' },
      newValue: { title: 'Nouveau titre' },
    });
    expect(Object.keys(entry.oldValue as object)).toEqual(['title']);
  });

  it('MONETIZATION can change the price and the change is audited', async () => {
    const { service, audit } = makeService(series());
    const updated = await service.update(
      '0192f1f0-8a5b-7c3d-9e1f-00000000se01',
      { coinCostPerEpisode: 15 },
      admin('MONETIZATION'),
    );
    expect(updated.coinCostPerEpisode).toBe(15);
    expect(audit.record.mock.calls[0]?.[0]).toMatchObject({
      oldValue: { coinCostPerEpisode: 10 },
      newValue: { coinCostPerEpisode: 15 },
    });
  });
});

describe('AdminSeriesService.publish / archive', () => {
  it('refuses to publish without a READY episode (409 SERIES_NO_READY_EPISODE)', async () => {
    const { service, tx } = makeService(series(), 0);
    await expect(service.publish(series().id, admin('ADMIN'))).rejects.toMatchObject({
      response: { code: 'SERIES_NO_READY_EPISODE' },
    });
    expect(tx.series.update).not.toHaveBeenCalled();
  });

  it('publishes when an episode is READY, sets publishedAt once and audits the transition', async () => {
    const { service, tx, audit, prisma } = makeService(series(), 1);
    const published = await service.publish(series().id, admin('EDITOR'));
    expect(published.status).toBe('PUBLISHED');
    // DEF-001 : les épisodes prêts sans date deviennent visibles à la publication.
    expect(prisma.episode.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { seriesId: series().id, transcodeStatus: 'READY', publishedAt: null },
        data: { publishedAt: expect.any(Date) },
      }),
    );
    expect(tx.series.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: 'PUBLISHED', publishedAt: expect.any(Date) },
      }),
    );
    const publishEntry = audit.record.mock.calls.find(
      (c) => (c[0] as Record<string, unknown>).action === 'series.publish',
    )?.[0];
    expect(publishEntry).toMatchObject({
      action: 'series.publish',
      oldValue: { status: 'DRAFT' },
      newValue: { status: 'PUBLISHED' },
    });
    expect(() => service.publish(series().id, admin('ADMIN'))).not.toThrow(ConflictException);
  });

  it('archives from any status', async () => {
    const { service } = makeService(series({ status: 'PUBLISHED', publishedAt: new Date() }));
    const archived = await service.archive(series().id, admin('ADMIN'));
    expect(archived.status).toBe('ARCHIVED');
  });

  it('B-12: publishes without a rights contract and records an audit warning, never a block', async () => {
    const { service, audit } = makeService(series({ rightsContract: null }), 1);
    const published = await service.publish(series().id, admin('ADMIN'));
    expect(published.status).toBe('PUBLISHED');
    expect(published.rightsStatus).toBe('NONE');
    const warning = audit.record.mock.calls.find(
      (c) => (c[0] as Record<string, unknown>).action === 'series.publish_rights_warning',
    )?.[0] as Record<string, unknown>;
    expect(warning).toMatchObject({ newValue: { rightsStatus: 'NONE' }, targetType: 'series' });
  });

  it('B-12: no audit warning when the rights contract is active', async () => {
    const { service, audit } = makeService(
      series({
        rightsContract: {
          id: 'c1',
          seriesId: series().id,
          rightsHolder: 'Le client',
          territories: [],
          licenseStartsAt: new Date('2020-01-01T00:00:00Z'),
          licenseEndsAt: null,
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      }),
      1,
    );
    const published = await service.publish(series().id, admin('ADMIN'));
    expect(published.rightsStatus).toBe('ACTIVE');
    expect(
      audit.record.mock.calls.some(
        (c) => (c[0] as Record<string, unknown>).action === 'series.publish_rights_warning',
      ),
    ).toBe(false);
  });
});
