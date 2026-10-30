/**
 * Real-time developer notifications Google Play (S07-BE-07) : enveloppe Pub/Sub (`message.data`
 * base64 d'un `DeveloperNotification`). Analyse pure, testée unitairement.
 */
export interface DeveloperNotification {
  version?: string;
  packageName?: string;
  eventTimeMillis?: string;
  subscriptionNotification?: {
    version?: string;
    notificationType?: number;
    purchaseToken?: string;
    subscriptionId?: string;
  };
  oneTimeProductNotification?: {
    version?: string;
    notificationType?: number;
    purchaseToken?: string;
    sku?: string;
  };
  voidedPurchaseNotification?: {
    purchaseToken?: string;
    orderId?: string;
    productType?: number;
    refundType?: number;
  };
  testNotification?: { version?: string };
}

export type RtdnEvent =
  | { kind: 'test' }
  | {
      kind: 'subscription';
      purchaseToken: string;
      subscriptionId: string | null;
      notificationType: number;
    }
  | { kind: 'one_time'; purchaseToken: string; sku: string | null; notificationType: number }
  | {
      kind: 'voided';
      purchaseToken: string;
      productType: 'subs' | 'inapp' | 'unknown';
      orderId: string | null;
    }
  | { kind: 'ignored'; reason: string };

export const ONE_TIME_PRODUCT_PURCHASED = 1;
export const ONE_TIME_PRODUCT_CANCELED = 2;

export function decodeDeveloperNotification(data: string): DeveloperNotification | null {
  try {
    const json = Buffer.from(data, 'base64').toString('utf8');
    const parsed: unknown = JSON.parse(json);
    return typeof parsed === 'object' && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

export function classifyNotification(n: DeveloperNotification): RtdnEvent {
  if (n.testNotification) return { kind: 'test' };
  if (n.subscriptionNotification?.purchaseToken) {
    return {
      kind: 'subscription',
      purchaseToken: n.subscriptionNotification.purchaseToken,
      subscriptionId: n.subscriptionNotification.subscriptionId ?? null,
      notificationType: n.subscriptionNotification.notificationType ?? 0,
    };
  }
  if (n.voidedPurchaseNotification?.purchaseToken) {
    const type = n.voidedPurchaseNotification.productType;
    return {
      kind: 'voided',
      purchaseToken: n.voidedPurchaseNotification.purchaseToken,
      productType: type === 1 ? 'subs' : type === 2 ? 'inapp' : 'unknown',
      orderId: n.voidedPurchaseNotification.orderId ?? null,
    };
  }
  if (n.oneTimeProductNotification?.purchaseToken) {
    return {
      kind: 'one_time',
      purchaseToken: n.oneTimeProductNotification.purchaseToken,
      sku: n.oneTimeProductNotification.sku ?? null,
      notificationType: n.oneTimeProductNotification.notificationType ?? 0,
    };
  }
  return { kind: 'ignored', reason: 'no recognised notification' };
}
