import { PlaybackService } from './playback.service.js';

const episode = {
  id: 'ep-3',
  seriesId: 's1',
  number: 3,
  hlsKey: 'hls/ep-3/master.m3u8',
  durationSeconds: 90,
  subtitles: [],
  series: { id: 's1', freeEpisodeCount: 2, coinCostPerEpisode: 10 },
};

function makeService(opts: {
  autoUnlock: boolean;
  outcome?: unknown;
  quote?: { balance: number; affordable: boolean };
}) {
  const prisma = {
    episode: {
      findFirst: vi.fn(({ where }: { where: { id?: string; number?: number } }) =>
        Promise.resolve(where.number ? null : episode),
      ),
    },
    user: { findUnique: vi.fn(() => Promise.resolve({ autoUnlock: opts.autoUnlock })) },
    watchProgress: { findUnique: vi.fn(() => Promise.resolve(null)) },
  };
  const entitlements = {
    forViewer: vi.fn(() =>
      Promise.resolve({ isVip: false, unlocked: new Set<string>(), country: null }),
    ),
  };
  const unlocks = {
    unlock: vi.fn(() =>
      Promise.resolve(
        opts.outcome ?? {
          kind: 'unlocked',
          method: 'coins',
          charged: { bonus: 0, purchased: 10 },
          balance: 5,
          created: true,
        },
      ),
    ),
    quote: vi.fn(() => Promise.resolve(opts.quote ?? { balance: 15, affordable: true })),
  };
  const config = { cdnBaseUrl: 'http://cdn' };
  const signer = {
    sign: vi.fn((url: string) => ({ url: `${url}?signed`, expiresAt: '2026-10-30T13:00:00.000Z' })),
  };
  const service = new PlaybackService(
    prisma as never,
    entitlements as never,
    unlocks as never,
    config as never,
    signer as never,
  );
  return { service, prisma, unlocks };
}

describe('PlaybackService.play auto-unlock (S07-BE-03)', () => {
  const viewer = { userId: 'u1', country: 'TG' as string | null };

  it('unlocks a locked episode in the same request when autoUnlock is on and the balance suffices', async () => {
    const { service, unlocks, prisma } = makeService({ autoUnlock: true });
    const session = await service.play('u1', 'ep-3', viewer);
    expect(session).toMatchObject({
      access: 'unlocked',
      unlocked: true,
      manifestUrl: 'http://cdn/hls/ep-3/master.m3u8?signed',
    });
    expect(unlocks.unlock).toHaveBeenCalledWith('u1', episode, episode.series);
    // DEF-004 : le filtre territorial du catalogue est appliqué à la lecture.
    expect(prisma.episode.findFirst.mock.calls[0]?.[0]).toMatchObject({
      where: {
        id: 'ep-3',
        series: {
          status: 'PUBLISHED',
          OR: [{ territories: { isEmpty: true } }, { territories: { has: 'TG' } }],
        },
      },
    });
  });

  it('answers 403 EPISODE_LOCKED with cost, balance and canAutoUnlock when autoUnlock is off', async () => {
    const { service, unlocks } = makeService({
      autoUnlock: false,
      quote: { balance: 15, affordable: true },
    });
    await expect(service.play('u1', 'ep-3', viewer)).rejects.toMatchObject({
      response: {
        code: 'EPISODE_LOCKED',
        details: { coinCost: 10, balance: 15, canAutoUnlock: true },
      },
    });
    expect(unlocks.unlock).not.toHaveBeenCalled();
  });

  it('answers 403 with canAutoUnlock=false when autoUnlock is on but the balance is insufficient', async () => {
    const { service } = makeService({
      autoUnlock: true,
      outcome: { kind: 'insufficient', cost: 10, balance: 3 },
    });
    await expect(service.play('u1', 'ep-3', viewer)).rejects.toMatchObject({
      response: {
        code: 'EPISODE_LOCKED',
        details: { coinCost: 10, balance: 3, canAutoUnlock: false },
      },
    });
  });
});

describe('PlaybackService.saveProgress (DEF-003)', () => {
  it('refuses progress on a locked episode with 403 EPISODE_LOCKED', async () => {
    const { service } = makeService({ autoUnlock: true });
    await expect(
      service.saveProgress(
        'u1',
        { episodeId: 'ep-3', positionSeconds: 5 },
        { userId: 'u1', country: null },
      ),
    ).rejects.toMatchObject({ response: { code: 'EPISODE_LOCKED' } });
  });
});
