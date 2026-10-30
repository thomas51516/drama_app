import { classifyNotification, decodeDeveloperNotification } from './rtdn.js';

const encode = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64');

describe('RTDN parsing (S07-BE-07)', () => {
  it('decodes the Pub/Sub base64 payload and ignores garbage', () => {
    expect(
      decodeDeveloperNotification(encode({ version: '1.0', testNotification: { version: '1.0' } })),
    ).toMatchObject({ version: '1.0' });
    expect(decodeDeveloperNotification('not-base64-json')).toBeNull();
    expect(decodeDeveloperNotification(Buffer.from('"str"').toString('base64'))).toBeNull();
  });

  it('classifies subscription, voided and one-time notifications', () => {
    expect(classifyNotification({ testNotification: {} })).toEqual({ kind: 'test' });
    expect(
      classifyNotification({
        subscriptionNotification: {
          notificationType: 2,
          purchaseToken: 'tok',
          subscriptionId: 'vip_month',
        },
      }),
    ).toEqual({
      kind: 'subscription',
      purchaseToken: 'tok',
      subscriptionId: 'vip_month',
      notificationType: 2,
    });
    expect(
      classifyNotification({
        voidedPurchaseNotification: { purchaseToken: 'tok', productType: 2, orderId: 'GPA.1' },
      }),
    ).toEqual({
      kind: 'voided',
      purchaseToken: 'tok',
      productType: 'inapp',
      orderId: 'GPA.1',
    });
    expect(
      classifyNotification({
        voidedPurchaseNotification: { purchaseToken: 'tok', productType: 1 },
      }),
    ).toMatchObject({ productType: 'subs' });
    expect(
      classifyNotification({
        oneTimeProductNotification: { notificationType: 2, purchaseToken: 'tok', sku: 'coins_100' },
      }),
    ).toEqual({
      kind: 'one_time',
      purchaseToken: 'tok',
      sku: 'coins_100',
      notificationType: 2,
    });
    expect(classifyNotification({ version: '1.0' })).toMatchObject({ kind: 'ignored' });
  });
});
