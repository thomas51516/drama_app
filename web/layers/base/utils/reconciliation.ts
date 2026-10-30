import type { Price, TopupReconciliation, TopupReconciliationMismatch } from '../types/api'
import { SCHEDULE_TIME_ZONE } from '../types/api'
import { formatPrice } from './monetization'
import { todayWallDate, wallDateKey } from './schedule'

/**
 * Pure helpers of the top-up reconciliation page (B-11, contract v1.5): the `date` query
 * (a Lomé civil day), derived counters and the CSV export of the mismatches.
 */

export const RECONCILIATION_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** `YYYY-MM-DD` of today in Lomé time (what the backend's daily job uses). */
export function todayReconciliationDate(now: Date = new Date()): string {
  return wallDateKey(todayWallDate(now, SCHEDULE_TIME_ZONE))
}

export function isReconciliationDate(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    RECONCILIATION_DATE_RE.test(value) &&
    !Number.isNaN(Date.parse(value))
  )
}

/** A local picker `Date` (year/month/day fields) → `YYYY-MM-DD`. */
export function dateToParam(date: Date | null | undefined): string | null {
  if (!date || Number.isNaN(date.getTime())) return null
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** `YYYY-MM-DD` → local picker `Date` at midnight (fields only matter). */
export function paramToDate(param: string | null | undefined): Date | null {
  if (!isReconciliationDate(param)) return null
  const [year, month, day] = param.split('-').map(Number) as [number, number, number]
  return new Date(year, month - 1, day)
}

export interface ReconciliationTile {
  key: 'orders' | 'paid' | 'credited' | 'mismatches'
  value: number
  /** Share of orders (paid), of paid (credited), null when undefined. */
  ratio: number | null
  severity: 'neutral' | 'ok' | 'warn' | 'danger'
}

/** Four tiles: orders, paid, credited (with the ratio to paid) and mismatches. */
export function reconciliationTiles(report: TopupReconciliation | null): ReconciliationTile[] {
  const orders = report?.orders ?? 0
  const paid = report?.paid ?? 0
  const credited = report?.credited ?? 0
  const mismatches = report?.mismatches.length ?? 0
  return [
    { key: 'orders', value: orders, ratio: null, severity: 'neutral' },
    { key: 'paid', value: paid, ratio: orders > 0 ? paid / orders : null, severity: 'neutral' },
    {
      key: 'credited',
      value: credited,
      ratio: paid > 0 ? credited / paid : null,
      severity: paid > 0 && credited < paid ? 'warn' : 'ok',
    },
    {
      key: 'mismatches',
      value: mismatches,
      ratio: null,
      severity: mismatches > 0 ? 'danger' : 'ok',
    },
  ]
}

export function isReconciled(report: TopupReconciliation | null): boolean {
  return Boolean(report) && report!.mismatches.length === 0 && report!.credited === report!.paid
}

/** CSV field: quoted when needed (comma, quote, newline), quotes doubled (RFC 4180). */
export function csvField(value: unknown): string {
  if (value === null || value === undefined) return ''
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value)
  return /[",\r\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export const MISMATCH_CSV_COLUMNS = [
  'date',
  'orderId',
  'userId',
  'packSku',
  'status',
  'providerStatus',
  'amount',
  'currency',
  'coinsExpected',
  'coinsCredited',
  'reason',
  'createdAt',
] as const

function amountMajor(price: Price | null | undefined): string {
  if (!price) return ''
  // Minor units → major with the currency's decimals, as a plain number for spreadsheets.
  const decimals = price.currency === 'XOF' ? 0 : 2
  return (price.amountMinor / 10 ** decimals).toFixed(decimals)
}

/** One CSV line per mismatch (header first, CRLF, UTF-8 BOM added by the download helper). */
export function reconciliationToCsv(report: TopupReconciliation): string {
  const header = MISMATCH_CSV_COLUMNS.join(',')
  const lines = report.mismatches.map((mismatch: TopupReconciliationMismatch) =>
    [
      report.date,
      mismatch.orderId,
      mismatch.userId ?? '',
      mismatch.packSku ?? '',
      mismatch.status ?? '',
      mismatch.providerStatus ?? '',
      amountMajor(mismatch.amount),
      mismatch.amount?.currency ?? '',
      mismatch.coinsExpected ?? '',
      mismatch.coinsCredited ?? '',
      mismatch.reason,
      mismatch.createdAt ?? '',
    ]
      .map(csvField)
      .join(','),
  )
  return [header, ...lines].join('\r\n') + '\r\n'
}

export function reconciliationCsvFilename(date: string): string {
  return `reconciliation-recharges-${date}.csv`
}

/** `1 700 FCFA + 12,00 €`: one day can mix currencies across countries. */
export function formatAmounts(amounts: Price[] | null | undefined, locale = 'fr'): string {
  if (!amounts || amounts.length === 0) return '—'
  return amounts.map((amount) => formatPrice(amount, locale)).join(' + ')
}

/** Human label of a mismatch amount for the table. */
export function mismatchAmountLabel(mismatch: TopupReconciliationMismatch, locale = 'fr'): string {
  return mismatch.amount ? formatPrice(mismatch.amount, locale) : '—'
}

/** Known reasons → i18n keys; unknown reasons are shown raw. */
export const MISMATCH_REASON_KEYS: Readonly<Record<string, string>> = {
  PAID_NOT_CREDITED: 'reconciliation.reasons.PAID_NOT_CREDITED',
  CREDITED_NOT_PAID: 'reconciliation.reasons.CREDITED_NOT_PAID',
  AMOUNT_MISMATCH: 'reconciliation.reasons.AMOUNT_MISMATCH',
  COINS_MISMATCH: 'reconciliation.reasons.COINS_MISMATCH',
  DUPLICATE_CREDIT: 'reconciliation.reasons.DUPLICATE_CREDIT',
  PROVIDER_UNKNOWN: 'reconciliation.reasons.PROVIDER_UNKNOWN',
}

export function mismatchReasonKey(reason: string): string | null {
  return MISMATCH_REASON_KEYS[reason] ?? null
}
