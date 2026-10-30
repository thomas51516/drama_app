/**
 * Port agrégateur mobile money (§10, S09-BE-01/02) : `fake` (page de paiement simulée servie par
 * l'API) ou `cinetpay` (initialisation de paiement + webhook vérifié par HMAC). Le crédit n'est
 * jamais déclenché par le site ou l'app : uniquement par le webhook signé.
 */
export const MOBILE_MONEY_PROVIDER = Symbol('MOBILE_MONEY_PROVIDER');

export interface PaymentOrder {
  id: string;
  userId: string;
  packSku: string;
  coins: number;
  currency: string;
  amountMinor: number;
  country: string;
  phone: string | null;
}

export interface PaymentInit {
  paymentUrl: string;
  providerReference: string | null;
  raw?: unknown;
}

export interface WebhookInput {
  rawBody: string;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}

export type WebhookOutcome = 'paid' | 'failed' | 'pending';

export interface WebhookEvent {
  /** Identifiant de commande DRAMA (transaction_id transmis à l'agrégateur). */
  orderId: string | null;
  /** Référence unique côté agrégateur (idempotence du crédit). */
  providerReference: string;
  status: WebhookOutcome;
  amountMinor: number | null;
  currency: string | null;
  raw: unknown;
}

export class WebhookSignatureError extends Error {
  constructor(message = 'Invalid webhook signature') {
    super(message);
    this.name = 'WebhookSignatureError';
  }
}

export class PaymentProviderError extends Error {
  constructor(
    readonly reason: string,
    message = `Payment provider error: ${reason}`,
  ) {
    super(message);
    this.name = 'PaymentProviderError';
  }
}

export interface MobileMoneyProvider {
  readonly name: 'fake' | 'cinetpay';
  createPayment(order: PaymentOrder): Promise<PaymentInit>;
  /** Vérifie la signature puis normalise l'événement ; lève `WebhookSignatureError` sinon. */
  parseWebhook(input: WebhookInput): Promise<WebhookEvent>;
}

export function headerValue(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const v = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
}
