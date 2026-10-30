import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AnalyticsService, MAX_CLOCK_SKEW_MS } from './analytics.service.js';
import { ANALYTICS_EVENT_NAMES, PostEventsDto } from './dto/analytics.dto.js';

describe('Analytics events (§13, S06-BE-03)', () => {
  const now = new Date('2026-10-30T12:00:00Z');

  it('accepts only the §13 names and at most 50 events per call', async () => {
    const ok = plainToInstance(PostEventsDto, {
      events: [{ name: 'paywall_view', params: { seriesId: 's1' }, at: now.toISOString() }],
      sessionId: 'sess-1',
    });
    expect(await validate(ok, { whitelist: true, forbidNonWhitelisted: true })).toEqual([]);

    const bad = plainToInstance(PostEventsDto, {
      events: [{ name: 'rocket_launch', at: now.toISOString() }],
    });
    const errors = await validate(bad, { whitelist: true, forbidNonWhitelisted: true });
    expect(errors).not.toEqual([]);

    const many = plainToInstance(PostEventsDto, {
      events: Array.from({ length: 51 }, () => ({ name: 'app_open', at: now.toISOString() })),
    });
    expect((await validate(many)).map((e) => Object.keys(e.constraints ?? {}))).toEqual([
      ['arrayMaxSize'],
    ]);
    expect(ANALYTICS_EVENT_NAMES).toContain('push_open');
    expect(ANALYTICS_EVENT_NAMES).toHaveLength(16);
  });

  it('rejects params above 2 KB with a stable code', () => {
    expect(() =>
      AnalyticsService.validateParams(
        { name: 'share', params: { blob: 'x'.repeat(2100) }, at: '' },
        3,
      ),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ code: 'EVENT_PARAMS_TOO_LARGE' }),
      }),
    );
    expect(AnalyticsService.validateParams({ name: 'share', at: '' }, 0)).toEqual({});
  });

  it('keeps the device timestamp within ±7 days and falls back to the reception time', () => {
    expect(AnalyticsService.occurredAt('2026-10-29T12:00:00Z', now).toISOString()).toBe(
      '2026-10-29T12:00:00.000Z',
    );
    const tooOld = new Date(now.getTime() - MAX_CLOCK_SKEW_MS - 1).toISOString();
    expect(AnalyticsService.occurredAt(tooOld, now)).toBe(now);
    expect(AnalyticsService.occurredAt('garbage', now)).toBe(now);
  });

  it('inserts one row per event with the request context', async () => {
    const createMany = vi.fn(({ data }: { data: unknown[] }) =>
      Promise.resolve({ count: data.length }),
    );
    const service = new AnalyticsService({ analyticsEvent: { createMany } } as never);
    const out = await service.ingest(
      {
        events: [
          { name: 'episode_start', params: { episodeNumber: 3 }, at: '2026-10-30T11:59:00Z' },
          { name: 'push_open', at: '2026-10-30T11:59:30Z' },
        ],
        appVersion: '1.4.0',
      },
      { userId: 'u1', country: 'TG' },
      now,
    );
    expect(out).toEqual({ accepted: 2 });
    expect(createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          userId: 'u1',
          country: 'TG',
          appVersion: '1.4.0',
          name: 'episode_start',
          params: { episodeNumber: 3 },
          occurredAt: new Date('2026-10-30T11:59:00Z'),
          receivedAt: now,
        }),
        expect.objectContaining({ name: 'push_open', params: {} }),
      ],
    });
  });
});
