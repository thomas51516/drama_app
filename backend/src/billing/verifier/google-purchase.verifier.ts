import { readFile } from 'node:fs/promises';
import { Logger } from '@nestjs/common';
import { GoogleAuth } from 'google-auth-library';
import { type AppConfig } from '../../config/app-config.js';
import {
  type ProductState,
  PurchaseVerificationError,
  type PurchaseVerifier,
  type SubscriptionState,
  type VerifiedProduct,
  type VerifiedSubscription,
} from './purchase-verifier.js';

const API_BASE = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';
const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';

/** Requête HTTP authentifiée (injectable pour les tests). */
export type AuthorizedRequest = <T>(opts: {
  url: string;
  method: 'GET' | 'POST';
  data?: unknown;
}) => Promise<{ status: number; data: T }>;

/** `purchases.products.get` (Play Developer API v3). */
export interface ProductPurchaseResource {
  purchaseState?: number;
  consumptionState?: number;
  acknowledgementState?: number;
  orderId?: string;
  purchaseTimeMillis?: string;
  regionCode?: string;
  obfuscatedExternalAccountId?: string;
  productId?: string;
}

/** `purchases.subscriptionsv2.get`. */
export interface SubscriptionPurchaseV2Resource {
  subscriptionState?: string;
  startTime?: string;
  latestOrderId?: string;
  acknowledgementState?: string;
  linkedPurchaseToken?: string;
  lineItems?: Array<{
    productId?: string;
    expiryTime?: string;
    autoRenewingPlan?: { autoRenewEnabled?: boolean };
  }>;
  externalAccountIdentifiers?: { obfuscatedExternalAccountId?: string };
}

const PRODUCT_STATES: Record<number, ProductState> = {
  0: 'purchased',
  1: 'canceled',
  2: 'pending',
};
const SUBSCRIPTION_STATES: Record<string, SubscriptionState> = {
  SUBSCRIPTION_STATE_ACTIVE: 'active',
  SUBSCRIPTION_STATE_CANCELED: 'cancelled',
  SUBSCRIPTION_STATE_IN_GRACE_PERIOD: 'grace',
  SUBSCRIPTION_STATE_ON_HOLD: 'on_hold',
  SUBSCRIPTION_STATE_PAUSED: 'paused',
  SUBSCRIPTION_STATE_EXPIRED: 'expired',
  SUBSCRIPTION_STATE_PENDING: 'pending',
};

/**
 * Vérificateur Google Play (`BILLING_VERIFIER=google`) : compte de service
 * (`GOOGLE_PLAY_SERVICE_ACCOUNT_JSON|FILE`) lié à la Play Console, package `GOOGLE_PLAY_PACKAGE_NAME`.
 * Appels REST de la Play Developer API v3 : `purchases.products.get`, `purchases.subscriptionsv2.get`
 * et les acquittements (un achat non acquitté sous 3 jours est remboursé par Google).
 */
export class GooglePurchaseVerifier implements PurchaseVerifier {
  readonly name = 'google' as const;
  private readonly logger = new Logger(GooglePurchaseVerifier.name);
  private request: AuthorizedRequest | null;

  constructor(
    private readonly config: AppConfig,
    request?: AuthorizedRequest,
  ) {
    this.request = request ?? null;
  }

  async verifyProduct(productId: string, purchaseToken: string): Promise<VerifiedProduct> {
    const url = `${this.base()}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}`;
    const res = await this.call<ProductPurchaseResource>({ url, method: 'GET' });
    return mapProduct(productId, res);
  }

  async verifySubscription(purchaseToken: string): Promise<VerifiedSubscription> {
    const url = `${this.base()}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`;
    const res = await this.call<SubscriptionPurchaseV2Resource>({ url, method: 'GET' });
    return mapSubscription(res);
  }

  async acknowledgeProduct(productId: string, purchaseToken: string): Promise<void> {
    const url = `${this.base()}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`;
    await this.call({ url, method: 'POST', data: {} });
  }

  async acknowledgeSubscription(productId: string, purchaseToken: string): Promise<void> {
    const url = `${this.base()}/purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`;
    await this.call({ url, method: 'POST', data: {} });
  }

  private base(): string {
    const pkg = this.config.billing.packageName;
    if (!pkg)
      throw new PurchaseVerificationError('not_configured', 'GOOGLE_PLAY_PACKAGE_NAME is not set');
    return `${API_BASE}/${encodeURIComponent(pkg)}`;
  }

  private async call<T>(opts: { url: string; method: 'GET' | 'POST'; data?: unknown }): Promise<T> {
    const request = await this.authorizedRequest();
    try {
      const res = await request<T>(opts);
      return res.data;
    } catch (err) {
      const status = (err as { response?: { status?: number } }).response?.status;
      const message = (err as Error).message;
      if (status === 400 || status === 404 || status === 410) {
        this.logger.warn(`Play API rejected ${opts.method} ${opts.url}: ${status} ${message}`);
        throw new PurchaseVerificationError(
          status === 404 ? 'not_found' : 'invalid_token',
          message,
        );
      }
      this.logger.error(`Play API error on ${opts.method} ${opts.url}: ${message}`);
      throw err;
    }
  }

  private async authorizedRequest(): Promise<AuthorizedRequest> {
    if (this.request) return this.request;
    const { serviceAccountJson, serviceAccountFile } = this.config.billing;
    const raw =
      serviceAccountJson ??
      (serviceAccountFile ? await readFile(serviceAccountFile, 'utf8') : null);
    if (!raw)
      throw new PurchaseVerificationError(
        'not_configured',
        'Google Play service account is not set',
      );
    const credentials = JSON.parse(raw) as Record<string, unknown>;
    const auth = new GoogleAuth({ credentials, scopes: [SCOPE] });
    const client = await auth.getClient();
    this.request = async <T>(opts: { url: string; method: 'GET' | 'POST'; data?: unknown }) => {
      const res = await client.request<T>({ url: opts.url, method: opts.method, data: opts.data });
      return { status: res.status, data: res.data };
    };
    return this.request;
  }
}

export function mapProduct(productId: string, r: ProductPurchaseResource): VerifiedProduct {
  const state = PRODUCT_STATES[r.purchaseState ?? -1];
  if (!state)
    throw new PurchaseVerificationError('unknown_state', `purchaseState=${r.purchaseState}`);
  return {
    productId: r.productId ?? productId,
    orderId: r.orderId ?? null,
    state,
    acknowledged: r.acknowledgementState === 1,
    purchaseTime: r.purchaseTimeMillis ? new Date(Number(r.purchaseTimeMillis)) : null,
    regionCode: r.regionCode ?? null,
    obfuscatedAccountId: r.obfuscatedExternalAccountId ?? null,
    raw: r,
  };
}

export function mapSubscription(r: SubscriptionPurchaseV2Resource): VerifiedSubscription {
  const state = SUBSCRIPTION_STATES[r.subscriptionState ?? ''];
  if (!state)
    throw new PurchaseVerificationError(
      'unknown_state',
      `subscriptionState=${r.subscriptionState}`,
    );
  const line = r.lineItems?.[0];
  if (!line?.productId) throw new PurchaseVerificationError('missing_line_item');
  return {
    productId: line.productId,
    orderId: r.latestOrderId ?? null,
    state,
    startTime: r.startTime ? new Date(r.startTime) : null,
    expiryTime: line.expiryTime ? new Date(line.expiryTime) : null,
    autoRenewing: line.autoRenewingPlan?.autoRenewEnabled === true,
    acknowledged: r.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
    linkedPurchaseToken: r.linkedPurchaseToken ?? null,
    obfuscatedAccountId: r.externalAccountIdentifiers?.obfuscatedExternalAccountId ?? null,
    raw: r,
  };
}
