import type {
  CoinPack,
  Currency,
  Price,
  TopupOrder,
  TopupOrderCreated,
  TopupOrderStatus,
} from '../types/api'
import { TOPUP_ORDER_STATUSES } from '../types/api'
import { currencyForCountry, formatPrice } from './monetization'

/**
 * Pure helpers of the recharge site (S09-WEB, contract v1.5): the countries offered, price
 * display, the order state machine and the polling schedule after the payment redirect.
 */

// ---------------------------------------------------------------------------
// Countries and prices
// ---------------------------------------------------------------------------

/** Countries proposed by the selector (mobile money markets first), with their currency. */
export const RECHARGE_COUNTRIES: readonly { code: string; currency: Currency }[] = [
  { code: 'TG', currency: 'XOF' },
  { code: 'BJ', currency: 'XOF' },
  { code: 'CI', currency: 'XOF' },
  { code: 'SN', currency: 'XOF' },
  { code: 'BF', currency: 'XOF' },
  { code: 'ML', currency: 'XOF' },
  { code: 'NE', currency: 'XOF' },
  { code: 'GW', currency: 'XOF' },
  { code: 'NG', currency: 'NGN' },
  { code: 'GH', currency: 'GHS' },
  { code: 'FR', currency: 'EUR' },
  { code: 'US', currency: 'USD' },
]

export const DEFAULT_RECHARGE_COUNTRY = 'TG'

export function isRechargeCountry(value: unknown): value is string {
  return typeof value === 'string' && RECHARGE_COUNTRIES.some((country) => country.code === value)
}

/** The selector value, or the account country when offered, or Togo. */
export function resolveCountry(
  selected: string | null | undefined,
  accountCountry: string | null | undefined,
): string {
  if (isRechargeCountry(selected)) return selected
  if (isRechargeCountry(accountCountry)) return accountCountry
  return DEFAULT_RECHARGE_COUNTRY
}

/** Price label in the user's locale, `—` when the pack has no price. */
export function packPriceLabel(pack: Pick<CoinPack, 'price'>, locale = 'fr'): string {
  return formatPrice(pack.price, locale)
}

/** True when the shop fell back to USD for a country that normally uses another currency. */
export function isCurrencyFallback(country: string, shopCurrency: Currency): boolean {
  return currencyForCountry(country) !== shopCurrency
}

/** Bonus as a share of the paid coins (`+10 %`), null when the pack has no bonus. */
export function packBonusPercent(pack: Pick<CoinPack, 'coins' | 'bonusCoins'>): number | null {
  if (!pack.bonusCoins || pack.coins <= 0) return null
  return Math.round((pack.bonusCoins / pack.coins) * 100)
}

/** Price per coin (major units) for the « meilleur rapport » hint. */
export function pricePerCoin(pack: Pick<CoinPack, 'coins' | 'bonusCoins' | 'price'>): number {
  const total = pack.coins + pack.bonusCoins
  if (total <= 0) return Number.POSITIVE_INFINITY
  const decimals = pack.price.currency === 'XOF' ? 0 : 2
  return pack.price.amountMinor / 10 ** decimals / total
}

/** Sku of the cheapest pack per coin, to tag it « meilleur rapport » (null with < 2 packs). */
export function bestValueSku(packs: readonly CoinPack[]): string | null {
  if (packs.length < 2) return null
  return [...packs].sort((a, b) => pricePerCoin(a) - pricePerCoin(b))[0]?.sku ?? null
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export function isTopupStatus(value: unknown): value is TopupOrderStatus {
  return typeof value === 'string' && (TOPUP_ORDER_STATUSES as readonly string[]).includes(value)
}

export function orderId(order: TopupOrder): string {
  return order.orderId ?? order.id ?? ''
}

/**
 * Coins credited by a PAID order: `coins` (purchased) + `bonusCoins` when the backend reports
 * them separately (confirmed against the real API, which does not fold the bonus into `coins`
 * despite the contract text). Falls back to `coins` alone when there is no separate bonus.
 */
export function orderTotalCoins(order: Pick<TopupOrder, 'coins' | 'bonusCoins'>): number {
  return order.coins + (order.bonusCoins ?? 0)
}

/** A terminal order never changes again: stop polling. */
export function isTerminalStatus(status: TopupOrderStatus): boolean {
  return status !== 'PENDING'
}

/** An expired `expiresAt` on a PENDING order is shown as EXPIRED even before the server says so. */
export function effectiveStatus(
  order: Pick<TopupOrder, 'status' | 'expiresAt'>,
  now: Date = new Date(),
): TopupOrderStatus {
  if (
    order.status === 'PENDING' &&
    order.expiresAt &&
    new Date(order.expiresAt).getTime() <= now.getTime()
  ) {
    return 'EXPIRED'
  }
  return order.status
}

export type PayStep =
  /** The order exists, the user has not left for the provider yet. */
  | 'ready'
  /** Back from the provider (or waiting): the site polls the order. */
  | 'waiting'
  /** Polled long enough without a terminal status: offer to keep waiting or come back later. */
  | 'timeout'
  | 'paid'
  | 'failed'
  | 'expired'

export const PAY_POLL_INTERVAL_MS = 3000
/** After ~2 minutes of PENDING the page stops polling and shows the « toujours en attente » state. */
export const PAY_POLL_MAX_ATTEMPTS = 40

/**
 * Next step of the payment page from the polled status, whether the user came back from the
 * provider (`returned`) and how many polls were done.
 */
export function payStep(
  status: TopupOrderStatus,
  options: { returned: boolean; attempts: number },
): PayStep {
  if (status === 'PAID') return 'paid'
  if (status === 'FAILED') return 'failed'
  if (status === 'EXPIRED') return 'expired'
  if (!options.returned) return 'ready'
  return options.attempts >= PAY_POLL_MAX_ATTEMPTS ? 'timeout' : 'waiting'
}

export function canRetry(step: PayStep): boolean {
  return step === 'failed' || step === 'expired' || step === 'timeout'
}

/** Idempotency key of an order (RFC 4122 v4 when available). */
export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

/** What the pay page keeps about an order it just created (the GET may omit `paymentUrl`). */
export interface PendingOrderMemo {
  orderId: string
  packSku: string
  country: string
  paymentUrl: string
  amount: Price
  expiresAt: string
  coins: number
}

export function memoFromCreated(
  created: TopupOrderCreated,
  input: { packSku: string; country: string; coins: number },
): PendingOrderMemo {
  return {
    orderId: created.orderId,
    packSku: input.packSku,
    country: input.country,
    paymentUrl: created.paymentUrl,
    amount: created.amount,
    expiresAt: created.expiresAt,
    coins: input.coins,
  }
}

/** A `paymentUrl` is opened in place; relative URLs (mock page) stay inside the site. */
export function isExternalPaymentUrl(url: string): boolean {
  return /^https?:\/\//i.test(url)
}

/** Newest first for the history page. */
export function sortOrders(orders: readonly TopupOrder[]): TopupOrder[] {
  return [...orders].sort(
    (a, b) =>
      new Date(b.createdAt ?? b.creditedAt ?? 0).getTime() -
      new Date(a.createdAt ?? a.creditedAt ?? 0).getTime(),
  )
}

/** Severity of a status tag. */
export function orderStatusSeverity(
  status: TopupOrderStatus,
): 'success' | 'danger' | 'warn' | 'secondary' {
  if (status === 'PAID') return 'success'
  if (status === 'FAILED') return 'danger'
  if (status === 'EXPIRED') return 'secondary'
  return 'warn'
}

// ---------------------------------------------------------------------------
// Phone numbers (OTP sign-in)
// ---------------------------------------------------------------------------

/** Dial codes of the offered countries, to prefill the phone field. */
export const DIAL_CODES: Readonly<Record<string, string>> = {
  TG: '+228',
  BJ: '+229',
  CI: '+225',
  SN: '+221',
  BF: '+226',
  ML: '+223',
  NE: '+227',
  GW: '+245',
  NG: '+234',
  GH: '+233',
  FR: '+33',
  US: '+1',
}

/** `00 228 90 12 34 56` / `+228 90123456` → `+22890123456`; null when not E.164. */
export function normalizePhone(raw: string): string | null {
  let digits = raw.replace(/[\s().-]/g, '')
  if (digits.startsWith('00')) digits = `+${digits.slice(2)}`
  if (!/^\+[1-9]\d{6,14}$/.test(digits)) return null
  return digits
}

export const OTP_LENGTH = 6

export function isCompleteOtp(code: string): boolean {
  return /^\d{6}$/.test(code)
}

export const PASSWORD_MIN = 8

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim())
}

/** Mobile money operators shown per country on the landing page (informative, from §10). */
export const OPERATORS_BY_COUNTRY: Readonly<Record<string, readonly string[]>> = {
  TG: ['Flooz', 'Mixx by Yas'],
  BJ: ['MTN MoMo', 'Moov Money', 'Celtiis'],
  CI: ['Orange Money', 'MTN MoMo', 'Wave', 'Moov Money'],
  SN: ['Orange Money', 'Wave', 'Free Money'],
  BF: ['Orange Money', 'Moov Money'],
  ML: ['Orange Money', 'Moov Money'],
  NE: ['Airtel Money', 'Moov Money'],
  GW: ['Orange Money', 'MTN MoMo'],
  NG: ['OPay', 'PalmPay', 'MTN MoMo'],
  GH: ['MTN MoMo', 'Telecel Cash', 'AirtelTigo Money'],
  FR: ['Carte bancaire'],
  US: ['Card'],
}

export function operatorsFor(country: string): readonly string[] {
  return OPERATORS_BY_COUNTRY[country] ?? []
}

// ---------------------------------------------------------------------------
// Public auth error messages (i18n keys under `recharge.authErrors`)
// ---------------------------------------------------------------------------

const AUTH_ERROR_KEYS: Readonly<Record<string, string>> = {
  INVALID_CREDENTIALS: 'recharge.authErrors.invalidCredentials',
  EMAIL_TAKEN: 'recharge.authErrors.emailTaken',
  OTP_INVALID_CODE: 'recharge.authErrors.otpInvalid',
  OTP_REQUEST_NOT_FOUND: 'recharge.authErrors.otpExpired',
  OTP_RESEND_TOO_SOON: 'recharge.authErrors.otpTooSoon',
  USER_BLOCKED: 'recharge.authErrors.blocked',
  RATE_LIMITED: 'recharge.authErrors.rateLimited',
  GOOGLE_AUTH_DISABLED: 'recharge.authErrors.googleDisabled',
  SMS_DELIVERY_FAILED: 'recharge.authErrors.smsFailed',
  VALIDATION_ERROR: 'recharge.authErrors.validation',
}

/** French-ready key for a failed `/auth/*` call; never shows a raw status for a known 4xx. */
export function publicAuthErrorKey(error: unknown): string {
  const status = (error as { status?: number } | null)?.status ?? 0
  const code = (error as { code?: string | null } | null)?.code ?? null
  if (code && AUTH_ERROR_KEYS[code]) return AUTH_ERROR_KEYS[code] as string
  if (status === 0) return 'recharge.authErrors.network'
  if (status === 401) return 'recharge.authErrors.invalidCredentials'
  if (status === 429) return 'recharge.authErrors.rateLimited'
  if (status === 400) return 'recharge.authErrors.validation'
  return 'recharge.authErrors.generic'
}
