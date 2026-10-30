import { createHmac, timingSafeEqual } from 'node:crypto';
import { Logger } from '@nestjs/common';
import {
  headerValue,
  type MobileMoneyProvider,
  type PaymentInit,
  type PaymentOrder,
  PaymentProviderError,
  type WebhookEvent,
  type WebhookInput,
  type WebhookOutcome,
  WebhookSignatureError,
} from './mobile-money-provider.js';

export interface CinetPayConfig {
  apiKey: string;
  siteId: string;
  secret: string;
  baseUrl: string;
  notifyUrl: string;
  returnUrl: string | null;
}

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** Devises acceptées par CinetPay ; montants en unité majeure (XOF/XAF/GNF/CDF sans décimale). */
const CINETPAY_CURRENCIES = new Set(['XOF', 'XAF', 'CDF', 'GNF', 'USD']);

/** Champs du webhook concaténés, dans cet ordre, pour le jeton HMAC `x-token` (documentation CinetPay). */
export const CINETPAY_TOKEN_FIELDS = [
  'cpm_site_id',
  'cpm_trans_id',
  'cpm_trans_date',
  'cpm_amount',
  'cpm_currency',
  'signature',
  'payment_method',
  'cel_phone_num',
  'cpm_phone_prefixe',
  'cpm_language',
  'cpm_version',
  'cpm_payment_config',
  'cpm_page_action',
  'cpm_custom',
  'cpm_designation',
  'cpm_error_message',
] as const;

interface CinetPayResponse {
  code?: string;
  message?: string;
  data?: Record<string, unknown>;
}

/**
 * CinetPay (https://docs.cinetpay.com) : `POST /v2/payment` ouvre un paiement (`transaction_id` = id de
 * la commande DRAMA) et renvoie `payment_url` ; la notification (`notify_url`) arrive en POST
 * `application/x-www-form-urlencoded` avec un en-tête `x-token` = HMAC-SHA256(secret, champs concaténés).
 * Après vérification du jeton, le statut est confirmé auprès de `POST /v2/payment/check` (ACCEPTED / REFUSED).
 */
export class CinetPayMobileMoneyProvider implements MobileMoneyProvider {
  readonly name = 'cinetpay' as const;
  private readonly logger = new Logger(CinetPayMobileMoneyProvider.name);

  constructor(
    private readonly config: CinetPayConfig,
    private readonly fetchImpl: FetchLike = (url, init) => fetch(url, init),
  ) {}

  async createPayment(order: PaymentOrder): Promise<PaymentInit> {
    if (!CINETPAY_CURRENCIES.has(order.currency)) {
      throw new PaymentProviderError('currency_not_supported');
    }
    const amount = toMajorAmount(order.amountMinor, order.currency);
    const res = await this.post('/payment', {
      apikey: this.config.apiKey,
      site_id: this.config.siteId,
      transaction_id: order.id,
      amount,
      currency: order.currency,
      description: `DRAMA ${order.packSku}`,
      notify_url: this.config.notifyUrl,
      return_url: this.config.returnUrl ?? this.config.notifyUrl,
      channels: 'MOBILE_MONEY',
      lang: 'fr',
      metadata: order.userId,
      ...(order.phone ? { customer_phone_number: order.phone } : {}),
    });
    const paymentUrl = res.data?.['payment_url'];
    if (res.code !== '201' || typeof paymentUrl !== 'string') {
      throw new PaymentProviderError(`init_rejected:${res.code ?? 'unknown'}`);
    }
    const token = res.data?.['payment_token'];
    return { paymentUrl, providerReference: typeof token === 'string' ? token : null, raw: res };
  }

  async parseWebhook(input: WebhookInput): Promise<WebhookEvent> {
    const body = (input.body ?? {}) as Record<string, unknown>;
    const token = headerValue(input.headers, 'x-token') ?? '';
    if (!this.verifyToken(body, token)) throw new WebhookSignatureError();
    const transactionId = stringField(body['cpm_trans_id']);
    if (!transactionId) throw new WebhookSignatureError('Missing cpm_trans_id');
    const check = await this.post('/payment/check', {
      apikey: this.config.apiKey,
      site_id: this.config.siteId,
      transaction_id: transactionId,
    });
    const status = stringField(check.data?.['status']).toUpperCase();
    const operatorId = check.data?.['operator_id'];
    return {
      orderId: transactionId,
      providerReference:
        typeof operatorId === 'string' && operatorId
          ? `cinetpay:${operatorId}`
          : `cinetpay:${transactionId}`,
      status: mapStatus(status),
      amountMinor: toMinorAmount(
        check.data?.['amount'],
        stringField(check.data?.['currency'] ?? body['cpm_currency']),
      ),
      currency: typeof check.data?.['currency'] === 'string' ? check.data['currency'] : null,
      raw: { notification: body, check },
    };
  }

  /** Jeton HMAC attendu pour un corps de notification (exposé pour les tests). */
  expectedToken(body: Record<string, unknown>): string {
    const content = CINETPAY_TOKEN_FIELDS.map((f) => stringField(body[f])).join('');
    return createHmac('sha256', this.config.secret).update(content).digest('hex');
  }

  private verifyToken(body: Record<string, unknown>, token: string): boolean {
    const expected = Buffer.from(this.expectedToken(body));
    const given = Buffer.from(token.trim().toLowerCase());
    return expected.length === given.length && timingSafeEqual(expected, given);
  }

  private async post(path: string, payload: Record<string, unknown>): Promise<CinetPayResponse> {
    let res: Awaited<ReturnType<FetchLike>>;
    try {
      res = await this.fetchImpl(`${this.config.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      this.logger.error(`CinetPay ${path} unreachable: ${(err as Error).message}`);
      throw new PaymentProviderError('unreachable');
    }
    const json = (await res.json().catch(() => ({}))) as CinetPayResponse;
    if (!res.ok && !json.code) throw new PaymentProviderError(`http_${res.status}`);
    return json;
  }
}

/** Rend un champ de formulaire/JSON en chaîne sans jamais produire `[object Object]`. */
function stringField(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}

function mapStatus(status: string): WebhookOutcome {
  if (status === 'ACCEPTED') return 'paid';
  if (status === 'REFUSED' || status === 'CANCELLED' || status === 'FAILED') return 'failed';
  return 'pending';
}

/** CinetPay attend des montants en unité majeure ; XOF/XAF/GNF/CDF n'ont pas de décimale dans `Price`. */
export function toMajorAmount(amountMinor: number, currency: string): number {
  return currency === 'USD' ? Math.round(amountMinor) / 100 : amountMinor;
}

function toMinorAmount(amount: unknown, currency: string): number | null {
  const n = typeof amount === 'number' ? amount : Number.parseFloat(stringField(amount));
  if (!Number.isFinite(n)) return null;
  return currency === 'USD' ? Math.round(n * 100) : Math.round(n);
}
