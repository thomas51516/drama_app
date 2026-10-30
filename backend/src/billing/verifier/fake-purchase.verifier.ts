import { Logger } from '@nestjs/common';
import {
  type ProductState,
  PurchaseVerificationError,
  type PurchaseVerifier,
  type SubscriptionState,
  type VerifiedProduct,
  type VerifiedSubscription,
} from './purchase-verifier.js';

export const FAKE_TOKEN_PREFIX = 'fake:';
const PRODUCT_STATES = new Set<ProductState>(['purchased', 'pending', 'canceled']);
const SUBSCRIPTION_STATES = new Set<SubscriptionState>([
  'active',
  'cancelled',
  'grace',
  'on_hold',
  'paused',
  'expired',
  'pending',
]);
const DEFAULT_SUBSCRIPTION_DAYS = 30;

/**
 * Vérificateur simulé (`BILLING_VERIFIER=fake`, jamais en production) : accepte les jetons
 * `fake:<productId>:<nonce>` ; un 4e segment force l'état (`purchased|pending|canceled` pour un
 * pack, `active|cancelled|grace|on_hold|paused|expired` pour un abonnement) et un 5e le nombre
 * de jours de validité de l'abonnement (30 par défaut). Tout autre jeton est refusé.
 */
export class FakePurchaseVerifier implements PurchaseVerifier {
  readonly name = 'fake' as const;
  private readonly logger = new Logger(FakePurchaseVerifier.name);
  private readonly acknowledged = new Set<string>();

  verifyProduct(productId: string, purchaseToken: string): Promise<VerifiedProduct> {
    const parsed = parseFakeToken(purchaseToken);
    if (!parsed || parsed.productId !== productId) {
      return Promise.reject(new PurchaseVerificationError('invalid_token'));
    }
    const state = (parsed.state ?? 'purchased') as ProductState;
    if (!PRODUCT_STATES.has(state)) {
      return Promise.reject(new PurchaseVerificationError('invalid_state'));
    }
    return Promise.resolve({
      productId,
      orderId: `FAKE.${parsed.nonce}`,
      state,
      acknowledged: this.acknowledged.has(purchaseToken),
      purchaseTime: new Date(),
      regionCode: null,
      obfuscatedAccountId: null,
      raw: { fake: true, token: purchaseToken },
    });
  }

  verifySubscription(purchaseToken: string): Promise<VerifiedSubscription> {
    const parsed = parseFakeToken(purchaseToken);
    if (!parsed) return Promise.reject(new PurchaseVerificationError('invalid_token'));
    const state = (parsed.state ?? 'active') as SubscriptionState;
    if (!SUBSCRIPTION_STATES.has(state)) {
      return Promise.reject(new PurchaseVerificationError('invalid_state'));
    }
    const days = parsed.days ?? DEFAULT_SUBSCRIPTION_DAYS;
    const now = Date.now();
    const expiry = state === 'expired' ? new Date(now - 60_000) : new Date(now + days * 86_400_000);
    return Promise.resolve({
      productId: parsed.productId,
      orderId: `FAKE.${parsed.nonce}`,
      state,
      startTime: new Date(now),
      expiryTime: expiry,
      autoRenewing: state === 'active' || state === 'grace',
      acknowledged: this.acknowledged.has(purchaseToken),
      linkedPurchaseToken: null,
      obfuscatedAccountId: null,
      raw: { fake: true, token: purchaseToken },
    });
  }

  acknowledgeProduct(_productId: string, purchaseToken: string): Promise<void> {
    this.acknowledged.add(purchaseToken);
    this.logger.debug(`Fake acknowledge ${purchaseToken}`);
    return Promise.resolve();
  }

  acknowledgeSubscription(_productId: string, purchaseToken: string): Promise<void> {
    this.acknowledged.add(purchaseToken);
    return Promise.resolve();
  }
}

export function parseFakeToken(
  token: string,
): { productId: string; nonce: string; state?: string; days?: number } | null {
  if (!token.startsWith(FAKE_TOKEN_PREFIX)) return null;
  const [, productId, nonce, state, days] = token.split(':');
  if (!productId || !nonce) return null;
  const parsedDays = days === undefined ? undefined : Number.parseInt(days, 10);
  if (parsedDays !== undefined && (!Number.isFinite(parsedDays) || parsedDays <= 0)) return null;
  return { productId, nonce, state: state || undefined, days: parsedDays };
}
