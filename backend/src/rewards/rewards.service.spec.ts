import { RewardsService } from './rewards.service.js';

const USER = 'user-1';
const now = new Date('2026-10-30T10:00:00Z');

function makeService(opts: {
  last?: { day: string; streakDay: number } | null;
  inserted?: boolean;
  existingKey?: string;
  country?: string | null;
}) {
  const tx = {
    $queryRaw: vi.fn(() => Promise.resolve(opts.inserted === false ? [] : [{ id: 'claim-1' }])),
    checkinClaim: {
      findUniqueOrThrow: vi.fn(() =>
        Promise.resolve({ streakDay: 2, coins: 5, idempotencyKey: opts.existingKey ?? 'other' }),
      ),
    },
  };
  const prisma = {
    $transaction: vi.fn((cb: (t: typeof tx) => Promise<unknown>) => cb(tx)),
    user: {
      findUnique: vi.fn(() =>
        Promise.resolve({ country: opts.country ?? 'TG', displayName: null, language: 'fr' }),
      ),
    },
    checkinClaim: { findFirst: vi.fn(() => Promise.resolve(opts.last ?? null)) },
  };
  const wallet = {
    creditBonus: vi.fn(() => Promise.resolve({ purchased: 0, bonus: 10, total: 10 })),
    getWallet: vi.fn(() =>
      Promise.resolve({ purchased: 0, bonus: 10, total: 10, autoUnlock: false, bonusExpiring: [] }),
    ),
  };
  const settings = {
    get: vi.fn(() =>
      Promise.resolve({ checkinDays: [5, 5, 10, 10, 15, 20, 30], checkinResetOnMiss: true }),
    ),
  };
  const service = new RewardsService(
    prisma as never,
    wallet as never,
    settings as never,
    { record: vi.fn() } as never,
  );
  return { service, prisma, tx, wallet };
}

describe('RewardsService check-in (S08-BE-04)', () => {
  it('credits day 3 after two consecutive days, through the wallet only', async () => {
    const { service, wallet, tx } = makeService({ last: { day: '2026-10-29', streakDay: 2 } });
    const out = await service.claimCheckin(USER, 'key-1', now);
    expect(out).toMatchObject({ day: 3, coins: 10 });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(wallet.creditBonus).toHaveBeenCalledWith(
      tx,
      USER,
      expect.objectContaining({
        amount: 10,
        referenceType: 'checkin',
        idempotencyKey: `checkin:${USER}:2026-10-30`,
      }),
      now,
    );
  });

  it('answers 409 CHECKIN_ALREADY_CLAIMED with nextClaimAt when today is already claimed', async () => {
    const { service, wallet } = makeService({
      last: { day: '2026-10-30', streakDay: 2 },
      inserted: false,
    });
    await expect(service.claimCheckin(USER, 'key-2', now)).rejects.toMatchObject({
      response: {
        code: 'CHECKIN_ALREADY_CLAIMED',
        details: { nextClaimAt: '2026-10-31T00:00:00.000Z' },
      },
    });
    expect(wallet.creditBonus).not.toHaveBeenCalled();
  });

  it('replays the same result for the same idempotency key without crediting again', async () => {
    const { service, wallet } = makeService({
      last: { day: '2026-10-30', streakDay: 2 },
      inserted: false,
      existingKey: 'key-1',
    });
    const out = await service.claimCheckin(USER, 'key-1', now);
    expect(out).toMatchObject({ day: 2, coins: 5 });
    expect(wallet.creditBonus).not.toHaveBeenCalled();
  });

  it('uses the country timezone for the day and nextClaimAt (Lagos, UTC+1)', async () => {
    const late = new Date('2026-10-30T23:30:00Z');
    const { service } = makeService({ last: { day: '2026-10-31', streakDay: 1 }, country: 'NG' });
    const status = await service.getCheckin(USER, late);
    expect(status.claimedToday).toBe(true);
    expect(status.streakDay).toBe(1);
    expect(status.nextClaimAt).toBe('2026-10-31T23:00:00.000Z');
    expect(status.scale).toHaveLength(7);
  });

  it('reports streakDay 0 and nextClaimAt now when the streak was lost', async () => {
    const { service } = makeService({ last: { day: '2026-10-20', streakDay: 5 } });
    const status = await service.getCheckin(USER, now);
    expect(status).toMatchObject({
      claimedToday: false,
      streakDay: 0,
      nextClaimAt: now.toISOString(),
      resetOnMiss: true,
    });
  });
});
