import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  headerValue,
  type MobileMoneyProvider,
  type PaymentInit,
  type PaymentOrder,
  type WebhookEvent,
  type WebhookInput,
  WebhookSignatureError,
} from './mobile-money-provider.js';

export const FAKE_SIGNATURE_HEADER = 'x-fake-signature';

export interface FakeWebhookBody {
  orderId: string;
  reference: string;
  status: 'paid' | 'failed';
}

/**
 * Agrégateur simulé (`MOBILE_MONEY_PROVIDER=fake`, refusé en production) : la page de paiement
 * `GET /topup/fake/{orderId}` est servie par l'API ; ses boutons produisent un webhook JSON signé
 * `X-Fake-Signature: sha256=<HMAC-SHA256(MOBILE_MONEY_FAKE_SECRET, corps brut)>`, exactement comme
 * un agrégateur réel, de sorte que toute la chaîne (signature → crédit idempotent) est exercée.
 */
export class FakeMobileMoneyProvider implements MobileMoneyProvider {
  readonly name = 'fake' as const;

  constructor(
    private readonly secret: string,
    private readonly publicBaseUrl: string,
  ) {}

  createPayment(order: PaymentOrder): Promise<PaymentInit> {
    return Promise.resolve({
      paymentUrl: `${this.publicBaseUrl}/topup/fake/${order.id}`,
      providerReference: null,
    });
  }

  parseWebhook(input: WebhookInput): Promise<WebhookEvent> {
    const signature = headerValue(input.headers, FAKE_SIGNATURE_HEADER) ?? '';
    if (!this.verify(input.rawBody, signature)) {
      return Promise.reject(new WebhookSignatureError());
    }
    const body = input.body as Partial<FakeWebhookBody> | null;
    if (!body || typeof body.orderId !== 'string' || typeof body.reference !== 'string') {
      return Promise.reject(new WebhookSignatureError('Malformed fake webhook body'));
    }
    return Promise.resolve({
      orderId: body.orderId,
      providerReference: body.reference,
      status: body.status === 'paid' ? 'paid' : 'failed',
      amountMinor: null,
      currency: null,
      raw: body,
    });
  }

  sign(rawBody: string): string {
    return `sha256=${createHmac('sha256', this.secret).update(rawBody).digest('hex')}`;
  }

  private verify(rawBody: string, signature: string): boolean {
    const expected = Buffer.from(this.sign(rawBody));
    const given = Buffer.from(signature);
    return expected.length === given.length && timingSafeEqual(expected, given);
  }
}
