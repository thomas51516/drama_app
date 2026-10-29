import { type AuthenticatedAdmin } from '../../common/request-context.js';
import { AppConfig } from '../../config/app-config.js';
import { type Env } from '../../config/env.schema.js';
import { type Episode } from '../../generated/prisma/client.js';
import { AdminEpisodesService, safeFileName } from './admin-episodes.service.js';

const admin: AuthenticatedAdmin = {
  id: 'adm',
  email: 'editor@drama.local',
  displayName: 'E',
  role: 'EDITOR',
  jti: 'j',
  exp: 0,
};
const SERIES_ID = '0192f1f0-8a5b-7c3d-9e1f-00000000se01';

function episode(n: number, partial: Partial<Episode> = {}): Episode {
  return {
    id: `0192f1f0-8a5b-7c3d-9e1f-0000000000e${n}`,
    seriesId: SERIES_ID,
    number: n,
    title: `Ep ${n}`,
    durationSeconds: 0,
    transcodeStatus: 'PENDING',
    sourceKey: null,
    hlsKey: null,
    thumbnailUrl: null,
    previewKey: null,
    transcodeError: null,
    transcodeExternalId: null,
    publishedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  };
}

function makeService(episodes: Episode[], headResult: { sizeBytes: number } | null = null) {
  const state = new Map(episodes.map((e) => [e.id, { ...e }]));
  const updates: Array<{ id: string; number?: number }> = [];
  const episodeApi = {
    findMany: vi.fn(() => Promise.resolve([...state.values()].sort((a, b) => a.number - b.number))),
    findUnique: vi.fn(
      ({ where }: { where: { id?: string; seriesId_number?: { number: number } } }) => {
        if (where.id) return Promise.resolve(state.get(where.id) ?? null);
        const n = where.seriesId_number?.number;
        return Promise.resolve([...state.values()].find((e) => e.number === n) ?? null);
      },
    ),
    aggregate: vi.fn(() =>
      Promise.resolve({
        _max: { number: Math.max(0, ...[...state.values()].map((e) => e.number)) },
      }),
    ),
    create: vi.fn(({ data }: { data: Partial<Episode> }) =>
      Promise.resolve(episode(data.number as number, data)),
    ),
    update: vi.fn(({ where, data }: { where: { id: string }; data: Partial<Episode> }) => {
      updates.push({ id: where.id, number: data.number });
      const next = { ...(state.get(where.id) as Episode), ...data };
      state.set(where.id, next);
      return Promise.resolve(next);
    }),
    delete: vi.fn(() => Promise.resolve()),
  };
  const prisma = {
    $transaction: vi.fn((cb: (t: unknown) => Promise<unknown>) => cb({ episode: episodeApi })),
    episode: episodeApi,
    series: { findUnique: vi.fn(() => Promise.resolve({ id: SERIES_ID })) },
  };
  const audit = { record: vi.fn(() => Promise.resolve()) };
  const storage = {
    presignPut: vi.fn((key: string) =>
      Promise.resolve({ url: `http://minio/drama-media/${key}?sig=1`, expiresAt: 'later' }),
    ),
    head: vi.fn(() => Promise.resolve(headResult)),
    deletePrefix: vi.fn(() => Promise.resolve(0)),
    publicUrl: (key: string) => `http://cdn/${key}`,
  };
  const transcode = {
    providerName: 'local',
    submit: vi.fn((e: Episode) =>
      Promise.resolve({ ...e, transcodeStatus: 'UPLOADED', transcodeExternalId: 'job-1' }),
    ),
  };
  const config = new AppConfig({ UPLOAD_URL_TTL_SECONDS: 900 } as unknown as Env);
  const cache = { invalidateSeries: vi.fn(() => Promise.resolve(0)) };
  const service = new AdminEpisodesService(
    prisma as never,
    audit as never,
    storage as never,
    transcode as never,
    config,
    cache as never,
  );
  return { service, prisma, audit, storage, transcode, updates, cache };
}

describe('AdminEpisodesService.create', () => {
  it('auto-numbers max + 1', async () => {
    const { service, prisma } = makeService([episode(1), episode(2)]);
    const created = await service.create(SERIES_ID, { title: 'Trois' }, admin);
    expect(created.number).toBe(3);
    expect(prisma.episode.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ number: 3, title: 'Trois' }) }),
    );
  });

  it('rejects an explicit number already taken', async () => {
    const { service } = makeService([episode(1)]);
    await expect(service.create(SERIES_ID, { number: 1 }, admin)).rejects.toMatchObject({
      response: { code: 'EPISODE_NUMBER_TAKEN' },
    });
  });
});

describe('AdminEpisodesService.reorder', () => {
  it('renumbers 1..n in the given order using a two-pass update and audits old/new', async () => {
    const eps = [episode(1), episode(2), episode(3)];
    const { service, updates, audit } = makeService(eps);
    const order = [eps[2].id, eps[0].id, eps[1].id];
    const result = await service.reorder(SERIES_ID, { episodeIds: order }, admin);

    expect(result.map((e) => [e.id, e.number])).toEqual([
      [eps[2].id, 1],
      [eps[0].id, 2],
      [eps[1].id, 3],
    ]);
    // Première passe : numéros temporaires négatifs ; seconde passe : numéros définitifs.
    expect(updates.slice(0, 3).map((u) => u.number)).toEqual([-1, -2, -3]);
    expect(updates.slice(3).map((u) => u.number)).toEqual([1, 2, 3]);
    expect(audit.record.mock.calls[0]?.[0]).toMatchObject({
      action: 'episode.reorder',
      oldValue: [
        { id: eps[0].id, number: 1 },
        { id: eps[1].id, number: 2 },
        { id: eps[2].id, number: 3 },
      ],
      newValue: [
        { id: eps[2].id, number: 1 },
        { id: eps[0].id, number: 2 },
        { id: eps[1].id, number: 3 },
      ],
    });
  });

  it('rejects a list that does not match the series episodes exactly', async () => {
    const eps = [episode(1), episode(2)];
    const { service, updates } = makeService(eps);
    await expect(
      service.reorder(SERIES_ID, { episodeIds: [eps[0].id] }, admin),
    ).rejects.toMatchObject({
      response: { code: 'EPISODE_ORDER_MISMATCH', details: { missing: [eps[1].id] } },
    });
    expect(updates).toHaveLength(0);
  });

  it('is a no-op when the order is unchanged', async () => {
    const eps = [episode(1), episode(2)];
    const { service, updates, audit } = makeService(eps);
    await service.reorder(SERIES_ID, { episodeIds: eps.map((e) => e.id) }, admin);
    expect(updates).toHaveLength(0);
    expect(audit.record).not.toHaveBeenCalled();
  });
});

describe('AdminEpisodesService upload flow', () => {
  it('builds the source key sources/{seriesId}/{episodeId}/{fileName} and resets the status', async () => {
    const ep = episode(1, { transcodeStatus: 'READY' });
    const { service, prisma, storage } = makeService([ep]);
    const target = await service.createUploadUrl(
      ep.id,
      { fileName: 'Épisode 1 (final).mp4', contentType: 'video/mp4', sizeBytes: 1000 },
      admin,
    );
    expect(target.sourceKey).toBe(`sources/${SERIES_ID}/${ep.id}/Episode-1-final.mp4`);
    expect(target).toMatchObject({ method: 'PUT', headers: { 'Content-Type': 'video/mp4' } });
    expect(storage.presignPut).toHaveBeenCalledWith(target.sourceKey, 'video/mp4', 900);
    expect(prisma.episode.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { sourceKey: target.sourceKey, transcodeStatus: 'PENDING', transcodeError: null },
      }),
    );
  });

  it('uploaded: 409 SOURCE_NOT_UPLOADED when the object is missing, else submits to the provider', async () => {
    const ep = episode(1, { sourceKey: `sources/${SERIES_ID}/x/ep.mp4` });
    const missing = makeService([ep], null);
    await expect(missing.service.markUploaded(ep.id, admin)).rejects.toMatchObject({
      response: { code: 'SOURCE_NOT_UPLOADED' },
    });
    expect(missing.transcode.submit).not.toHaveBeenCalled();

    const present = makeService([ep], { sizeBytes: 42 });
    const result = await present.service.markUploaded(ep.id, admin);
    expect(result.transcodeStatus).toBe('UPLOADED');
    expect(present.transcode.submit).toHaveBeenCalledTimes(1);
    expect(present.audit.record.mock.calls[0]?.[0]).toMatchObject({
      action: 'episode.uploaded',
      newValue: expect.objectContaining({ sizeBytes: 42, provider: 'local' }),
    });
  });

  it('uploaded: 409 SOURCE_MISSING without an upload URL first', async () => {
    const { service } = makeService([episode(1)]);
    await expect(service.markUploaded(episode(1).id, admin)).rejects.toMatchObject({
      response: { code: 'SOURCE_MISSING' },
    });
  });

  it('poster presign returns a posters/ key and a CDN public URL', async () => {
    const { service } = makeService([]);
    const res = await service.presignPoster(
      { kind: 'poster', fileName: 'affiche verticale.PNG', contentType: 'image/png' },
      admin,
    );
    expect(res.key).toMatch(/^posters\/[0-9a-f-]{36}\/affiche-verticale\.png$/);
    expect(res.publicUrl).toBe(`http://cdn/${res.key}`);
  });
});

describe('safeFileName', () => {
  it('strips paths, accents and unsafe characters while keeping the extension', () => {
    expect(safeFileName('../../étrange nom?.MOV')).toBe('etrange-nom.mov');
    expect(safeFileName('???.mp4')).toBe('file.mp4');
  });
});
