import { AppConfig } from '../../config/app-config.js';
import { FakePurchaseVerifier, parseFakeToken } from './fake-purchase.verifier.js';
import { GooglePurchaseVerifier, mapProduct, mapSubscription } from './google-purchase.verifier.js';
import { PurchaseVerificationError } from './purchase-verifier.js';

describe('FakePurchaseVerifier (BILLING_VERIFIER=fake)', () => {
  const verifier = new FakePurchaseVerifier();

  it('accepts fake:<productId>:<nonce> tokens for the matching product and tracks acknowledgement', async () => {
    const product = await verifier.verifyProduct('coins_100', 'fake:coins_100:abc');
    expect(product).toMatchObject({
      productId: 'coins_100',
      state: 'purchased',
      acknowledged: false,
    });
    await verifier.acknowledgeProduct('coins_100', 'fake:coins_100:abc');
    expect((await verifier.verifyProduct('coins_100', 'fake:coins_100:abc')).acknowledged).toBe(
      true,
    );
  });

  it('rejects malformed tokens, product mismatches and unknown states', async () => {
    await expect(verifier.verifyProduct('coins_100', 'real-token-xyz')).rejects.toBeInstanceOf(
      PurchaseVerificationError,
    );
    await expect(verifier.verifyProduct('coins_100', 'fake:coins_300:abc')).rejects.toBeInstanceOf(
      PurchaseVerificationError,
    );
    await expect(
      verifier.verifyProduct('coins_100', 'fake:coins_100:abc:weird'),
    ).rejects.toBeInstanceOf(PurchaseVerificationError);
    expect(parseFakeToken('fake:x')).toBeNull();
    expect(parseFakeToken('fake:vip_month:n:active:7')).toEqual({
      productId: 'vip_month',
      nonce: 'n',
      state: 'active',
      days: 7,
    });
  });

  it('simulates subscription states and validity', async () => {
    const active = await verifier.verifySubscription('fake:vip_month:n1');
    expect(active.state).toBe('active');
    expect(active.expiryTime!.getTime()).toBeGreaterThan(Date.now() + 29 * 86_400_000);
    const expired = await verifier.verifySubscription('fake:vip_month:n2:expired');
    expect(expired.state).toBe('expired');
    expect(expired.expiryTime!.getTime()).toBeLessThan(Date.now());
    const cancelled = await verifier.verifySubscription('fake:vip_week:n3:cancelled:7');
    expect(cancelled).toMatchObject({ state: 'cancelled', autoRenewing: false });
  });
});

describe('GooglePurchaseVerifier (Play Developer API v3, mocked HTTP)', () => {
  const config = new AppConfig({
    BILLING_VERIFIER: 'google',
    GOOGLE_PLAY_PACKAGE_NAME: 'com.drama.app',
    GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: '{}',
  } as never);

  it('calls purchases.products.get and maps the resource', async () => {
    const request = vi.fn(() =>
      Promise.resolve({
        status: 200,
        data: {
          purchaseState: 0,
          acknowledgementState: 0,
          orderId: 'GPA.1',
          purchaseTimeMillis: '1761825600000',
          regionCode: 'TG',
          obfuscatedExternalAccountId: 'user-1',
        },
      }),
    );
    const verifier = new GooglePurchaseVerifier(config, request as never);
    const product = await verifier.verifyProduct('coins_100', 'tok/en');
    expect(request).toHaveBeenCalledWith({
      url: 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.drama.app/purchases/products/coins_100/tokens/tok%2Fen',
      method: 'GET',
    });
    expect(product).toMatchObject({
      productId: 'coins_100',
      state: 'purchased',
      acknowledged: false,
      orderId: 'GPA.1',
      regionCode: 'TG',
      obfuscatedAccountId: 'user-1',
    });
  });

  it('acknowledges products and subscriptions with POST :acknowledge', async () => {
    const request = vi.fn(() => Promise.resolve({ status: 200, data: {} }));
    const verifier = new GooglePurchaseVerifier(config, request as never);
    await verifier.acknowledgeProduct('coins_100', 't1');
    await verifier.acknowledgeSubscription('vip_month', 't2');
    expect(
      request.mock.calls.map((c) => (c as unknown as [{ url: string; method: string }])[0].url),
    ).toEqual([
      'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.drama.app/purchases/products/coins_100/tokens/t1:acknowledge',
      'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.drama.app/purchases/subscriptions/vip_month/tokens/t2:acknowledge',
    ]);
  });

  it('turns 400/404 from the Play API into PurchaseVerificationError and rethrows other failures', async () => {
    const notFound = Object.assign(new Error('not found'), { response: { status: 404 } });
    const verifier = new GooglePurchaseVerifier(
      config,
      vi.fn(() => Promise.reject(notFound)),
    );
    await expect(verifier.verifyProduct('coins_100', 't')).rejects.toMatchObject({
      reason: 'not_found',
    });
    const outage = Object.assign(new Error('boom'), { response: { status: 503 } });
    const down = new GooglePurchaseVerifier(
      config,
      vi.fn(() => Promise.reject(outage)),
    );
    await expect(down.verifyProduct('coins_100', 't')).rejects.toBe(outage);
  });

  it('maps SubscriptionPurchaseV2 states and line items', () => {
    const sub = mapSubscription({
      subscriptionState: 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
      startTime: '2026-10-01T00:00:00Z',
      latestOrderId: 'GPA.2',
      acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
      linkedPurchaseToken: 'old',
      lineItems: [
        {
          productId: 'vip_month',
          expiryTime: '2026-11-01T00:00:00Z',
          autoRenewingPlan: { autoRenewEnabled: true },
        },
      ],
      externalAccountIdentifiers: { obfuscatedExternalAccountId: 'u1' },
    });
    expect(sub).toMatchObject({
      productId: 'vip_month',
      state: 'grace',
      autoRenewing: true,
      acknowledged: true,
      linkedPurchaseToken: 'old',
      obfuscatedAccountId: 'u1',
    });
    expect(sub.expiryTime?.toISOString()).toBe('2026-11-01T00:00:00.000Z');
    expect(() =>
      mapSubscription({ subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE', lineItems: [] }),
    ).toThrow(PurchaseVerificationError);
    expect(mapProduct('p', { purchaseState: 2 }).state).toBe('pending');
    expect(() => mapProduct('p', { purchaseState: 9 })).toThrow(PurchaseVerificationError);
  });
});
