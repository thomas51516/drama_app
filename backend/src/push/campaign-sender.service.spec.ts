import { AppConfig } from '../config/app-config.js';
import { type Env } from '../config/env.schema.js';
import { type Campaign } from '../generated/prisma/client.js';
import { CampaignSenderService } from './campaign-sender.service.js';

const config = new AppConfig({ PUSH_DAILY_CAP: 2, PUSH_BATCH_SIZE: 500 } as unknown as Env);
const now = new Date('2026-10-30T12:00:00Z');

function segment(partial: Partial<Campaign>): Campaign {
  return {
    segmentType: 'ALL',
    countries: [],
    seriesId: null,
    inactiveDays: null,
    ...partial,
  } as Campaign;
}

const sqlText = (s: { strings: readonly string[] }) => s.strings.join('?').replace(/\s+/g, ' ');

describe('CampaignSenderService.segmentSql (B-10)', () => {
  it('always restricts to active users with a device who accept offers', () => {
    const sql = CampaignSenderService.segmentSql(segment({}), now);
    const text = sqlText(sql);
    expect(text).toContain("u.status = 'ACTIVE'");
    expect(text).toContain("notification_preferences->>'offers'");
    expect(text).toContain('EXISTS (SELECT 1 FROM push_devices d WHERE d.user_id = u.id)');
    expect(sql.values).toEqual([]);
  });

  it('COUNTRY filters on the account country list', () => {
    const sql = CampaignSenderService.segmentSql(
      segment({ segmentType: 'COUNTRY', countries: ['TG', 'CI'] }),
      now,
    );
    expect(sqlText(sql)).toContain('u.country::text = ANY(?::text[])');
    expect(sql.values).toEqual([['TG', 'CI']]);
  });

  it('SERIES_FOLLOWERS joins favorites of the series', () => {
    const sql = CampaignSenderService.segmentSql(
      segment({ segmentType: 'SERIES_FOLLOWERS', seriesId: 's1' }),
      now,
    );
    expect(sqlText(sql)).toContain(
      'FROM favorites f WHERE f.user_id = u.id AND f.series_id = ?::uuid',
    );
    expect(sql.values).toEqual(['s1']);
  });

  it('INACTIVE compares the last session or watch progress to now - N days', () => {
    const sql = CampaignSenderService.segmentSql(
      segment({ segmentType: 'INACTIVE', inactiveDays: 10 }),
      now,
    );
    const text = sqlText(sql);
    expect(text).toContain(
      'GREATEST(u.last_seen_at, (SELECT MAX(wp.updated_at) FROM watch_progress wp',
    );
    expect(text).toContain('u.created_at) < ?');
    expect(sql.values).toEqual([new Date('2026-10-20T12:00:00Z')]);
  });
});

describe('CampaignSenderService.sendBatch', () => {
  it('creates one in-app notification per user, pushes only under the cap and counts users', async () => {
    const created: Record<string, unknown>[] = [];
    const prisma = {
      notification: {
        createManyAndReturn: vi.fn(({ data }: { data: { userId: string }[] }) => {
          created.push(...data);
          return Promise.resolve(data.map((d, i) => ({ id: `n-${i}`, userId: d.userId })));
        }),
      },
      pushDevice: {
        findMany: vi.fn(() =>
          Promise.resolve([
            { userId: 'u1', token: 't1a' },
            { userId: 'u1', token: 't1b' },
            { userId: 'u2', token: 't2' },
          ]),
        ),
      },
      pushDelivery: { createMany: vi.fn(() => Promise.resolve({ count: 1 })) },
    };
    const push = {
      provider: { name: 'log' },
      consumeDailyCap: vi.fn(() => Promise.resolve(new Set(['u1', 'u2']))),
      deliver: vi.fn((msgs: { token: string }[]) =>
        Promise.resolve(msgs.map((m) => ({ token: m.token, ok: m.token !== 't2' }))),
      ),
      recordDeliveries: vi.fn(() => Promise.resolve()),
    };
    const sender = new CampaignSenderService(prisma as never, config, push as never);
    const campaign = segment({
      id: 'c1',
      title: 'Promo',
      body: 'Corps',
      deepLink: 'drama://shop',
    });
    const sent = await sender.sendBatch(campaign, ['u1', 'u2', 'u3'], now);
    expect(created).toHaveLength(3);
    expect(created[0]).toMatchObject({
      type: 'campaign',
      campaignId: 'c1',
      data: { type: 'campaign', campaignId: 'c1', deepLink: 'drama://shop' },
    });
    // u3 est plafonné : remise SKIPPED, pas de push.
    expect(prisma.pushDelivery.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ userId: 'u3', status: 'SKIPPED', error: 'daily_cap' })],
    });
    expect(push.deliver).toHaveBeenCalledTimes(1);
    expect((push.deliver.mock.calls[0] as unknown[])[0]).toHaveLength(3);
    // u1 a reçu (2 appareils), u2 a échoué : 1 utilisateur notifié.
    expect(sent).toBe(1);
  });
});
