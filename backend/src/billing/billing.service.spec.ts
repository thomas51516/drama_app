import { BillingService, subscriptionLabel } from './billing.service.js';

const encode = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64');

function makeService(
  opts: {
    rtdnToken?: string;
    purchase?: Record<string, unknown> | null;
    subscription?: Record<string, unknown> | null;
  } = {},
) {
  const tx = {
    purchase: { update: vi.fn(() => Promise.resolve({})) },
    subscription: {
      upsert: vi.fn(() => Promise.resolve({ id: 'sub-1' })),
      updateMany: vi.fn(() => Promise.resolve({ count: 0 })),
      findFirst: vi.fn(() => Promise.resolve({ endsAt: new Date('2026-12-01T00:00:00Z') })),
      update: vi.fn(() => Promise.resolve({})),
    },
    user: {
      findUniqueOrThrow: vi.fn(() => Promise.resolve({ isVip: false, vipExpiresAt: null })),
      update: vi.fn(() => Promise.resolve({})),
    },
  };
  const prisma = {
    $transaction: vi.fn((cb: (t: typeof tx) => Promise<unknown>) => cb(tx)),
    purchase: {
      findUnique: vi.fn(() => Promise.resolve(opts.purchase ?? null)),
      update: tx.purchase.update,
    },
    subscription: {
      findUnique: vi.fn(() => Promise.resolve(opts.subscription ?? null)),
      findFirst: vi.fn(() => Promise.resolve(null)),
      update: tx.subscription.update,
    },
    user: { findUnique: vi.fn(() => Promise.resolve({ id: 'u1', country: 'TG' })) },
    vipPlan: { findUnique: vi.fn(() => Promise.resolve(null)) },
  };
  const wallet = {
    refundPurchase: vi.fn(() => Promise.resolve({ purchased: -100, bonus: 0, total: -100 })),
    getWallet: vi.fn(),
  };
  const shop = {
    findPlanBySku: vi.fn(() =>
      Promise.resolve({ id: 'plan-1', sku: 'vip_month', period: 'MONTH' }),
    ),
    findPackBySku: vi.fn(),
  };
  const config = { billing: { rtdnAuthToken: opts.rtdnToken } };
  const verifier = {
    verifySubscription: vi.fn(() =>
      Promise.resolve({
        productId: 'vip_month',
        state: 'cancelled',
        startTime: new Date('2026-10-01T00:00:00Z'),
        expiryTime: new Date('2026-12-01T00:00:00Z'),
        autoRenewing: false,
        acknowledged: true,
        linkedPurchaseToken: null,
        obfuscatedAccountId: null,
        raw: {},
      }),
    ),
  };
  const service = new BillingService(
    prisma as never,
    wallet as never,
    shop as never,
    config as never,
    verifier as never,
    {
      purchaseBonus: vi.fn(() =>
        Promise.resolve({ welcomePercent: 0, limitedPercent: 0, extraBonus: 0 }),
      ),
    } as never,
  );
  return { service, prisma, tx, wallet, verifier };
}

describe('BillingService.handleGoogleRtdn (S07-BE-07)', () => {
  it('rejects the message when GOOGLE_RTDN_AUTH_TOKEN is set and not presented', async () => {
    const { service } = makeService({ rtdnToken: 'secret-rtdn-token-0123456789' });
    await expect(
      service.handleGoogleRtdn({ message: { data: encode({ testNotification: {} }) } }, 'wrong'),
    ).rejects.toMatchObject({
      response: { code: 'INVALID_WEBHOOK_SIGNATURE' },
    });
    await expect(
      service.handleGoogleRtdn(
        { message: { data: encode({ testNotification: {} }) } },
        'secret-rtdn-token-0123456789',
      ),
    ).resolves.toBeUndefined();
  });

  it('re-verifies a subscription notification and updates the stored subscription and the user VIP', async () => {
    const { service, tx, verifier } = makeService({ subscription: { id: 'sub-1', userId: 'u1' } });
    await service.handleGoogleRtdn({
      message: {
        data: encode({
          subscriptionNotification: {
            notificationType: 3,
            purchaseToken: 'tok',
            subscriptionId: 'vip_month',
          },
        }),
      },
    });
    expect(verifier.verifySubscription).toHaveBeenCalledWith('tok');
    expect(tx.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { purchaseToken: 'tok' },
        update: expect.objectContaining({ status: 'CANCELED', autoRenew: false, plan: 'MONTHLY' }),
      }),
    );
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { isVip: true, vipExpiresAt: new Date('2026-12-01T00:00:00Z') },
    });
  });

  it('refunds a credited pack on a voided in-app purchase (REFUND rows, status REFUNDED), idempotently', async () => {
    const purchase = {
      id: 'p1',
      userId: 'u1',
      status: 'ACKNOWLEDGED',
      coins: 100,
      bonusCoins: 10,
      purchaseToken: 'tok',
    };
    const { service, tx, wallet } = makeService({ purchase });
    await service.handleGoogleRtdn({
      message: {
        data: encode({ voidedPurchaseNotification: { purchaseToken: 'tok', productType: 2 } }),
      },
    });
    expect(wallet.refundPurchase).toHaveBeenCalledWith(tx, 'u1', purchase);
    expect(tx.purchase.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { status: 'REFUNDED' },
    });

    const { service: again, wallet: w2 } = makeService({
      purchase: { ...purchase, status: 'REFUNDED' },
    });
    await again.handleGoogleRtdn({
      message: {
        data: encode({ voidedPurchaseNotification: { purchaseToken: 'tok', productType: 2 } }),
      },
    });
    expect(w2.refundPurchase).not.toHaveBeenCalled();
  });

  it('ends the VIP on a voided subscription and ignores undecodable or unknown messages', async () => {
    const { service, tx } = makeService({ subscription: { id: 'sub-1', userId: 'u1' } });
    await service.handleGoogleRtdn({
      message: {
        data: encode({ voidedPurchaseNotification: { purchaseToken: 'tok', productType: 1 } }),
      },
    });
    expect(tx.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sub-1' },
        data: expect.objectContaining({ status: 'EXPIRED' }),
      }),
    );
    await expect(
      service.handleGoogleRtdn({ message: { data: 'garbage' } }),
    ).resolves.toBeUndefined();
  });

  it('maps stored subscriptions to the public status', () => {
    const future = new Date(Date.now() + 86_400_000);
    const past = new Date(Date.now() - 1000);
    expect(subscriptionLabel({ status: 'ACTIVE', endsAt: future })).toBe('active');
    expect(subscriptionLabel({ status: 'CANCELED', endsAt: future })).toBe('cancelled');
    expect(subscriptionLabel({ status: 'IN_GRACE', endsAt: future })).toBe('grace');
    expect(subscriptionLabel({ status: 'ON_HOLD', endsAt: future })).toBe('expired');
    expect(subscriptionLabel({ status: 'ACTIVE', endsAt: past })).toBe('expired');
  });
});
