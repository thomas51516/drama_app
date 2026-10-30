import { extraBonusFor, normalizeCode, OffersService, welcomeExpiry } from './offers.service.js';

const USER = 'user-1';
const now = new Date('2026-10-30T12:00:00Z');

function makeService(opts: {
  settings?: Partial<{
    welcomeOfferActive: boolean;
    welcomeOfferPackSku: string | null;
    welcomeOfferBonusPercent: number;
    welcomeOfferHours: number;
  }>;
  createdAt?: Date;
  purchases?: number;
  limited?: { packSku: string; bonusPercent: number }[];
  promo?: Record<string, unknown> | null;
  mine?: number;
  replay?: { coins: number; promoCode: { code: string } } | null;
}) {
  const tx = {
    $queryRaw: vi.fn(() => Promise.resolve(opts.promo === null ? [] : [opts.promo ?? basePromo])),
    promoRedemption: {
      findUnique: vi.fn(() => Promise.resolve(opts.replay ?? null)),
      count: vi.fn(() => Promise.resolve(opts.mine ?? 0)),
      create: vi.fn(() => Promise.resolve({ id: 'red-1' })),
    },
    promoCode: { update: vi.fn(() => Promise.resolve({})) },
    user: { findUnique: vi.fn(() => Promise.resolve({ createdAt: opts.createdAt ?? now })) },
    purchase: { count: vi.fn(() => Promise.resolve(opts.purchases ?? 0)) },
    limitedOffer: { findMany: vi.fn(() => Promise.resolve(opts.limited ?? [])) },
  };
  const prisma = {
    ...tx,
    $transaction: vi.fn((cb: (t: typeof tx) => Promise<unknown>) => cb(tx)),
  };
  const wallet = {
    creditBonus: vi.fn(() => Promise.resolve({ purchased: 0, bonus: 50, total: 50 })),
    getWallet: vi.fn(() =>
      Promise.resolve({ purchased: 0, bonus: 50, total: 50, autoUnlock: false, bonusExpiring: [] }),
    ),
  };
  const settings = {
    get: vi.fn(() =>
      Promise.resolve({
        welcomeOfferActive: true,
        welcomeOfferPackSku: null,
        welcomeOfferBonusPercent: 50,
        welcomeOfferHours: 48,
        ...opts.settings,
      }),
    ),
    invalidate: vi.fn(),
  };
  const service = new OffersService(
    prisma as never,
    wallet as never,
    settings as never,
    { record: vi.fn() } as never,
  );
  return { service, tx, wallet };
}

const basePromo = {
  id: 'promo-1',
  code: 'WELCOME',
  coins: 50,
  max_uses: 10,
  per_user_uses: 1,
  uses_count: 2,
  starts_at: null,
  ends_at: null,
  is_active: true,
  created_at: now,
  updated_at: now,
};

describe('welcome offer (M-24)', () => {
  it('applies to a fresh account without purchases, for any pack when packSku is null', async () => {
    const { service, tx } = makeService({ createdAt: new Date('2026-10-29T12:00:00Z') });
    const bonus = await service.purchaseBonus(tx as never, USER, 'coins_100', 100, now);
    expect(bonus).toEqual({ welcomePercent: 50, limitedPercent: 0, extraBonus: 50 });
    expect(await service.welcomeFor(USER, now)).toMatchObject({
      packSku: null,
      bonusPercent: 50,
      expiresAt: '2026-10-31T12:00:00.000Z',
    });
  });

  it('is skipped after the window, after a first purchase, or for another pack', async () => {
    const expired = makeService({ createdAt: new Date('2026-10-20T12:00:00Z') });
    expect(
      (await expired.service.purchaseBonus(expired.tx as never, USER, 'coins_100', 100, now))
        .welcomePercent,
    ).toBe(0);
    const bought = makeService({ purchases: 1 });
    expect(await bought.service.welcomeFor(USER, now)).toBeNull();
    const other = makeService({ settings: { welcomeOfferPackSku: 'coins_300' } });
    expect(
      (await other.service.purchaseBonus(other.tx as never, USER, 'coins_100', 100, now))
        .welcomePercent,
    ).toBe(0);
    expect(
      (await other.service.purchaseBonus(other.tx as never, USER, 'coins_300', 300, now))
        .extraBonus,
    ).toBe(150);
  });

  it('adds the best limited offer of the pack and rounds the bonus up', async () => {
    const { service, tx } = makeService({
      settings: { welcomeOfferActive: false },
      limited: [
        { packSku: 'coins_100', bonusPercent: 10 },
        { packSku: 'coins_100', bonusPercent: 25 },
        { packSku: 'coins_700', bonusPercent: 80 },
      ],
    });
    expect(await service.purchaseBonus(tx as never, USER, 'coins_100', 101, now)).toEqual({
      welcomePercent: 0,
      limitedPercent: 25,
      extraBonus: 26,
    });
    expect(extraBonusFor(0, 50)).toBe(0);
    expect(welcomeExpiry(new Date('2026-10-30T00:00:00Z'), 48).toISOString()).toBe(
      '2026-11-01T00:00:00.000Z',
    );
  });
});

describe('promo codes (M-24)', () => {
  it('credits a BONUS line through the wallet and increments the counters', async () => {
    const { service, tx, wallet } = makeService({});
    const out = await service.redeemPromo(USER, ' welcome ', 'key-1', now);
    expect(out.coins).toBe(50);
    expect(normalizeCode(' welcome ')).toBe('WELCOME');
    expect(tx.promoRedemption.create).toHaveBeenCalledWith({
      data: { promoCodeId: 'promo-1', userId: USER, coins: 50, idempotencyKey: 'key-1' },
    });
    expect(tx.promoCode.update).toHaveBeenCalledWith({
      where: { id: 'promo-1' },
      data: { usesCount: { increment: 1 } },
    });
    expect(wallet.creditBonus).toHaveBeenCalledWith(
      tx,
      USER,
      expect.objectContaining({
        amount: 50,
        referenceType: 'promo_code',
        idempotencyKey: 'promo:red-1',
      }),
      now,
    );
  });

  it('maps the rules to PROMO_INVALID, PROMO_EXPIRED, PROMO_EXHAUSTED and PROMO_ALREADY_USED', async () => {
    await expect(
      makeService({ promo: null }).service.redeemPromo(USER, 'X', 'k', now),
    ).rejects.toMatchObject({
      response: { code: 'PROMO_INVALID' },
    });
    await expect(
      makeService({ promo: { ...basePromo, is_active: false } }).service.redeemPromo(
        USER,
        'X',
        'k',
        now,
      ),
    ).rejects.toMatchObject({ response: { code: 'PROMO_INVALID' } });
    await expect(
      makeService({
        promo: { ...basePromo, starts_at: new Date('2026-11-01T00:00:00Z') },
      }).service.redeemPromo(USER, 'X', 'k', now),
    ).rejects.toMatchObject({ response: { code: 'PROMO_INVALID' } });
    await expect(
      makeService({
        promo: { ...basePromo, ends_at: new Date('2026-10-01T00:00:00Z') },
      }).service.redeemPromo(USER, 'X', 'k', now),
    ).rejects.toMatchObject({ response: { code: 'PROMO_EXPIRED' } });
    await expect(
      makeService({ promo: { ...basePromo, uses_count: 10 } }).service.redeemPromo(
        USER,
        'X',
        'k',
        now,
      ),
    ).rejects.toMatchObject({ response: { code: 'PROMO_EXHAUSTED' } });
    await expect(
      makeService({ mine: 1 }).service.redeemPromo(USER, 'X', 'k', now),
    ).rejects.toMatchObject({
      response: { code: 'PROMO_ALREADY_USED' },
    });
  });

  it('replays the same idempotency key without a second credit', async () => {
    const { service, wallet, tx } = makeService({
      replay: { coins: 50, promoCode: { code: 'WELCOME' } },
    });
    expect((await service.redeemPromo(USER, 'welcome', 'key-1', now)).coins).toBe(50);
    expect(wallet.creditBonus).not.toHaveBeenCalled();
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });
});
