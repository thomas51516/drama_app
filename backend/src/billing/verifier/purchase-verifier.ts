/**
 * Port de vérification des achats Google Play (§10, S07-BE-06) : `google` (Play Developer API)
 * ou `fake` (développement et tests, refusé en production par la configuration).
 */
export const PURCHASE_VERIFIER = Symbol('PURCHASE_VERIFIER');

export type ProductState = 'purchased' | 'pending' | 'canceled';

export interface VerifiedProduct {
  productId: string;
  orderId: string | null;
  state: ProductState;
  acknowledged: boolean;
  purchaseTime: Date | null;
  regionCode: string | null;
  /** `obfuscatedExternalAccountId` fourni par l'app au lancement de l'achat (identifiant utilisateur). */
  obfuscatedAccountId: string | null;
  raw: unknown;
}

export type SubscriptionState =
  'active' | 'cancelled' | 'grace' | 'on_hold' | 'paused' | 'expired' | 'pending';

export interface VerifiedSubscription {
  productId: string;
  orderId: string | null;
  state: SubscriptionState;
  startTime: Date | null;
  expiryTime: Date | null;
  autoRenewing: boolean;
  acknowledged: boolean;
  linkedPurchaseToken: string | null;
  obfuscatedAccountId: string | null;
  raw: unknown;
}

/** Jeton inconnu, mal formé ou refusé par le magasin : l'API répond `400 PURCHASE_INVALID`. */
export class PurchaseVerificationError extends Error {
  constructor(
    readonly reason: string,
    message = `Purchase verification failed: ${reason}`,
  ) {
    super(message);
    this.name = 'PurchaseVerificationError';
  }
}

export interface PurchaseVerifier {
  readonly name: 'fake' | 'google';
  verifyProduct(productId: string, purchaseToken: string): Promise<VerifiedProduct>;
  verifySubscription(purchaseToken: string): Promise<VerifiedSubscription>;
  acknowledgeProduct(productId: string, purchaseToken: string): Promise<void>;
  acknowledgeSubscription(productId: string, purchaseToken: string): Promise<void>;
}

/** États qui donnent accès au VIP (l'annulation garde l'accès jusqu'à l'échéance). */
export const ACCESS_GRANTING_STATES: ReadonlySet<SubscriptionState> = new Set([
  'active',
  'cancelled',
  'grace',
]);
