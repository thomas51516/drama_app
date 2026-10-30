import { AppConfig } from '../config/app-config.js';
import { type Env } from '../config/env.schema.js';
import { LogPushProvider } from './providers/log-push.provider.js';
import { dailyCapKey, PushService } from './push.service.js';
import { type PushProvider } from './push.types.js';

const config = new AppConfig({ PUSH_DAILY_CAP: 2, PUSH_BATCH_SIZE: 500 } as unknown as Env);

function makeService(provider: PushProvider = new LogPushProvider(), devices = ['tok-a', 'tok-b']) {
  const notifications: { id: string }[] = [];
  const deliveries: Record<string, unknown>[] = [];
  const counters = new Map<string, number>();
  const prisma = {
    notification: {
      create: vi.fn(({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `n-${notifications.length + 1}`, ...data };
        notifications.push(row);
        return Promise.resolve(row);
      }),
    },
    pushDevice: {
      findMany: vi.fn(() => Promise.resolve(devices.map((token) => ({ token })))),
      deleteMany: vi.fn(({ where }: { where: { token: { in: string[] } } }) => {
        devices = devices.filter((t) => !where.token.in.includes(t));
        return Promise.resolve({ count: where.token.in.length });
      }),
    },
    pushDelivery: {
      create: vi.fn(({ data }: { data: Record<string, unknown> }) => {
        deliveries.push(data);
        return Promise.resolve(data);
      }),
      createMany: vi.fn(({ data }: { data: Record<string, unknown>[] }) => {
        deliveries.push(...data);
        return Promise.resolve({ count: data.length });
      }),
    },
  };
  const redis = {
    client: {
      multi: () => {
        const ops: (() => [null, number])[] = [];
        const chain = {
          incr: (key: string) => {
            ops.push(() => {
              const next = (counters.get(key) ?? 0) + 1;
              counters.set(key, next);
              return [null, next];
            });
            return chain;
          },
          expire: () => {
            ops.push(() => [null, 1]);
            return chain;
          },
          exec: () => Promise.resolve(ops.map((op) => op())),
        };
        return chain;
      },
    },
  };
  const service = new PushService(prisma as never, redis as never, config, provider);
  return { service, prisma, deliveries, counters, devices: () => devices };
}

describe('PushService.notify (M-54)', () => {
  it('writes the in-app row, pushes to every device and logs deliveries', async () => {
    const { service, deliveries } = makeService();
    const out = await service.notify({
      userId: 'u1',
      type: 'new_episode',
      title: 'Nouvel épisode',
      body: 'Épisode 2',
      data: { seriesId: 's1', episodeId: 'e2' },
    });
    expect(out).toEqual({ notificationId: 'n-1', pushed: 2 });
    expect(deliveries).toHaveLength(2);
    expect(deliveries[0]).toMatchObject({ status: 'SENT', provider: 'log', userId: 'u1' });
  });

  it('applies the daily cap (2 per user, all causes) and records a SKIPPED delivery', async () => {
    const { service, deliveries, counters } = makeService();
    const now = new Date('2026-10-30T10:00:00Z');
    const input = { userId: 'u1', type: 'campaign' as const, title: 't', body: 'b' };
    expect((await service.notify(input, now)).pushed).toBe(2);
    expect((await service.notify(input, now)).pushed).toBe(2);
    const third = await service.notify(input, now);
    expect(third).toMatchObject({ notificationId: 'n-3', pushed: 0, skipped: 'daily_cap' });
    expect(deliveries.at(-1)).toMatchObject({ status: 'SKIPPED', error: 'daily_cap' });
    expect(counters.get(dailyCapKey('u1', now))).toBe(3);
    // Autre jour : nouveau compteur.
    const tomorrow = new Date('2026-10-31T10:00:00Z');
    expect((await service.notify(input, tomorrow)).pushed).toBe(2);
  });

  it('does not consume the cap when the user has no device', async () => {
    const { service, counters } = makeService(new LogPushProvider(), []);
    const out = await service.notify({
      userId: 'u1',
      type: 'support_reply',
      title: 't',
      body: 'b',
    });
    expect(out).toMatchObject({ pushed: 0, skipped: 'no_device' });
    expect(counters.size).toBe(0);
  });

  it('removes tokens the provider reports as invalid and tolerates provider failures', async () => {
    const flaky: PushProvider = {
      name: 'fcm',
      send: vi.fn((msgs: { token: string }[]) =>
        Promise.resolve(
          msgs.map((m) =>
            m.token === 'tok-a'
              ? {
                  token: m.token,
                  ok: false,
                  error: 'messaging/registration-token-not-registered',
                  invalidToken: true,
                }
              : { token: m.token, ok: true, messageId: 'id' },
          ),
        ),
      ),
    };
    const { service, devices, deliveries } = makeService(flaky);
    const out = await service.notify({ userId: 'u1', type: 'new_episode', title: 't', body: 'b' });
    expect(out.pushed).toBe(1);
    expect(devices()).toEqual(['tok-b']);
    expect(deliveries.map((d) => d.status)).toEqual(['FAILED', 'SENT']);

    const broken: PushProvider = { name: 'fcm', send: () => Promise.reject(new Error('boom')) };
    const second = makeService(broken);
    const res = await second.service.notify({
      userId: 'u1',
      type: 'campaign',
      title: 't',
      body: 'b',
    });
    expect(res.pushed).toBe(0);
    expect(second.deliveries.every((d) => d.status === 'FAILED' && d.error === 'boom')).toBe(true);
  });
});
