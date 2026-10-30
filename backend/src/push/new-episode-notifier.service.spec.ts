import {
  newEpisodeGroupKey,
  NewEpisodeNotifier,
  prefersNewEpisodes,
} from './new-episode-notifier.service.js';

function makeNotifier(
  followers: { id: string; language: string; notificationPreferences: unknown }[],
) {
  const keys = new Set<string>();
  const prisma = {
    episode: {
      findFirst: vi.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(
          where.id === 'hidden'
            ? null
            : { id: where.id, number: 4, seriesId: 's1', series: { title: 'Héritage' } },
        ),
      ),
    },
    favorite: {
      findMany: vi.fn(() => Promise.resolve(followers.map((user) => ({ user })))),
    },
  };
  const redis = {
    client: {
      set: vi.fn((key: string, _v: string, _ex: string, _ttl: number, nx: string) => {
        if (nx === 'NX' && keys.has(key)) return Promise.resolve(null);
        keys.add(key);
        return Promise.resolve('OK');
      }),
    },
  };
  const push = { notify: vi.fn(() => Promise.resolve({ notificationId: 'n', pushed: 1 })) };
  const notifier = new NewEpisodeNotifier(prisma as never, redis as never, push as never);
  return { notifier, push, keys };
}

describe('NewEpisodeNotifier (M-54)', () => {
  const now = new Date('2026-10-30T14:20:00Z');

  it('notifies opted-in followers in their language with routing data', async () => {
    const { notifier, push } = makeNotifier([
      { id: 'u-fr', language: 'fr', notificationPreferences: null },
      { id: 'u-en', language: 'en', notificationPreferences: { offers: false } },
      { id: 'u-off', language: 'fr', notificationPreferences: { newEpisodes: false } },
    ]);
    const out = await notifier.notifyEpisode('e4', now);
    expect(out).toEqual({ notified: 2 });
    expect(push.notify).toHaveBeenCalledTimes(2);
    expect(push.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u-fr',
        type: 'new_episode',
        title: 'Nouvel épisode de Héritage',
        body: 'L’épisode 4 est disponible.',
        data: { seriesId: 's1', episodeId: 'e4' },
      }),
      now,
    );
    expect(push.notify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u-en', title: 'New episode of Héritage' }),
      now,
    );
  });

  it('groups per series and per hour: a second episode in the same hour is skipped', async () => {
    const { notifier, push, keys } = makeNotifier([
      { id: 'u1', language: 'fr', notificationPreferences: null },
    ]);
    expect(await notifier.notifyEpisode('e4', now)).toEqual({ notified: 1 });
    expect(await notifier.notifyEpisode('e5', new Date('2026-10-30T14:59:00Z'))).toEqual({
      notified: 0,
      skipped: 'grouped',
    });
    expect(keys.has(newEpisodeGroupKey('s1', now))).toBe(true);
    expect(await notifier.notifyEpisode('e6', new Date('2026-10-30T15:00:00Z'))).toEqual({
      notified: 1,
    });
    expect(push.notify).toHaveBeenCalledTimes(2);
  });

  it('ignores episodes that are not visible yet and does not claim the hour slot', async () => {
    const { notifier, keys } = makeNotifier([
      { id: 'u1', language: 'fr', notificationPreferences: null },
    ]);
    expect(await notifier.notifyEpisode('hidden', now)).toEqual({
      notified: 0,
      skipped: 'not_visible',
    });
    expect(keys.size).toBe(0);
  });

  it('prefersNewEpisodes defaults to true', () => {
    expect(prefersNewEpisodes(null)).toBe(true);
    expect(prefersNewEpisodes({ offers: false })).toBe(true);
    expect(prefersNewEpisodes({ newEpisodes: false })).toBe(false);
  });
});
