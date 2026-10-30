import type {
  AdminRole,
  AdminUserSummary,
  AdminUserUnlock,
  AppUser,
  CoinAdjustmentInput,
  CoinBucket,
  LedgerEntry,
  LedgerEntryType,
  UnlockMethod,
  Wallet,
} from '../types/api'
import { COIN_BUCKETS } from '../types/api'
import { ApiError } from './api-error'

/**
 * Pure helpers of the users module (B-09, contract v1.4): role gating, labels, the manual coin
 * adjustment (preview of the resulting balance, validation) and the French mapping of the 4xx
 * codes of the backend. Error codes are i18n keys.
 */

// ---------------------------------------------------------------------------
// Roles and labels
// ---------------------------------------------------------------------------

/** User search, detail, credit/debit and blocking are open to SUPPORT and ADMIN. */
export function canManageUsers(role: AdminRole | null | undefined): boolean {
  return role === 'SUPPORT' || role === 'ADMIN'
}

/** Display name, else e-mail, else phone, else a shortened id. */
export function userLabel(
  user: Pick<AppUser | AdminUserSummary, 'id' | 'displayName' | 'email' | 'phone'>,
): string {
  return user.displayName?.trim() || user.email?.trim() || user.phone?.trim() || shortId(user.id)
}

/** Total coins of a search result, whichever shape the API used. */
export function summaryCoins(user: Pick<AdminUserSummary, 'balance' | 'coins'>): number | null {
  if (user.balance && typeof user.balance.total === 'number') return user.balance.total
  return typeof user.coins === 'number' ? user.coins : null
}

export function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…` : id
}

/** Search needs at least 2 characters (an id prefix, part of an e-mail, a phone…). */
export const USER_SEARCH_MIN = 2

export function normalizeSearch(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ')
}

export function isSearchable(raw: string): boolean {
  return normalizeSearch(raw).length >= USER_SEARCH_MIN
}

export function userStatusSeverity(
  status: AppUser['status'],
): 'success' | 'danger' | 'warn' | 'secondary' {
  switch (status) {
    case 'ACTIVE':
      return 'success'
    case 'BLOCKED':
      return 'danger'
    case 'DELETION_PENDING':
      return 'warn'
    default:
      return 'secondary'
  }
}

/** The backend enum is upper case (`COINS`), the public contract lower case (`coins`). */
export function normalizeUnlockMethod(method: AdminUserUnlock['method']): UnlockMethod | 'other' {
  const value = String(method).toLowerCase()
  return value === 'coins' ||
    value === 'ad' ||
    value === 'vip' ||
    value === 'free' ||
    value === 'auto'
    ? value
    : 'other'
}

export function ledgerTypeSeverity(
  type: LedgerEntryType,
): 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast' {
  switch (type) {
    case 'PURCHASE':
      return 'success'
    case 'BONUS':
      return 'info'
    case 'UNLOCK':
      return 'secondary'
    case 'ADJUSTMENT':
      return 'warn'
    case 'EXPIRY':
    case 'REFUND':
      return 'danger'
    case 'MERGE':
      return 'contrast'
  }
}

// ---------------------------------------------------------------------------
// Client-side pagination (the detail embeds the lists)
// ---------------------------------------------------------------------------

export const USER_LIST_PAGE_SIZE = 20

export function paginate<T>(
  items: readonly T[],
  page: number,
  pageSize = USER_LIST_PAGE_SIZE,
): T[] {
  const safePage = Math.max(1, page)
  const start = (safePage - 1) * pageSize
  return items.slice(start, start + pageSize)
}

/** Newest first, whatever order the API used. */
export function sortLedger(entries: readonly LedgerEntry[]): LedgerEntry[] {
  return [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

// ---------------------------------------------------------------------------
// Manual adjustment (credit / debit)
// ---------------------------------------------------------------------------

export const ADJUSTMENT_REASON_MIN = 10
export const ADJUSTMENT_REASON_MAX = 500
export const ADJUSTMENT_MAX = 100_000

export type AdjustmentDirection = 'credit' | 'debit'

export interface AdjustmentFormValues {
  direction: AdjustmentDirection
  /** Absolute amount typed by the agent; the sign comes from `direction`. */
  amount: number | null
  bucket: CoinBucket
  reason: string
}

export type AdjustmentFormErrors = Partial<Record<keyof AdjustmentFormValues, string>>

export function emptyAdjustmentForm(): AdjustmentFormValues {
  return { direction: 'credit', amount: null, bucket: 'BONUS', reason: '' }
}

/** Signed amount of the contract (`amount (±)`). */
export function signedAmount(values: Pick<AdjustmentFormValues, 'direction' | 'amount'>): number {
  const amount = Math.abs(values.amount ?? 0)
  return values.direction === 'debit' ? -amount : amount
}

export interface AdjustmentPreview {
  purchased: number
  bonus: number
  total: number
  /** True when the debit would take a bucket below zero (the server refuses it). */
  negative: boolean
}

/** Balance after the adjustment, bucket by bucket (the server is the source of truth). */
export function adjustmentPreview(
  wallet: Pick<Wallet, 'purchased' | 'bonus'>,
  values: Pick<AdjustmentFormValues, 'direction' | 'amount' | 'bucket'>,
): AdjustmentPreview {
  const delta = signedAmount(values)
  const purchased = wallet.purchased + (values.bucket === 'PURCHASED' ? delta : 0)
  const bonus = wallet.bonus + (values.bucket === 'BONUS' ? delta : 0)
  return { purchased, bonus, total: purchased + bonus, negative: purchased < 0 || bonus < 0 }
}

export function validateAdjustment(
  values: AdjustmentFormValues,
  wallet: Pick<Wallet, 'purchased' | 'bonus'>,
): AdjustmentFormErrors {
  const errors: AdjustmentFormErrors = {}
  const amount = values.amount
  if (amount === null || amount === undefined || !Number.isFinite(amount)) {
    errors.amount = 'validation.required'
  } else if (!Number.isInteger(amount) || amount <= 0) {
    errors.amount = 'users.validation.amountPositive'
  } else if (amount > ADJUSTMENT_MAX) {
    errors.amount = 'validation.max'
  } else if (adjustmentPreview(wallet, values).negative) {
    errors.amount = 'users.validation.insufficient'
  }
  if (!COIN_BUCKETS.includes(values.bucket)) errors.bucket = 'validation.unknownValue'
  const reason = values.reason.trim()
  if (reason.length < ADJUSTMENT_REASON_MIN) errors.reason = 'users.validation.reasonMin'
  else if (reason.length > ADJUSTMENT_REASON_MAX) errors.reason = 'validation.maxLength'
  return errors
}

export function adjustmentToInput(values: AdjustmentFormValues): CoinAdjustmentInput {
  return { amount: signedAmount(values), bucket: values.bucket, reason: values.reason.trim() }
}

/** Block / unblock share the same reason rule. */
export function validateReason(reason: string): string | undefined {
  const trimmed = reason.trim()
  if (trimmed.length < ADJUSTMENT_REASON_MIN) return 'users.validation.reasonMin'
  if (trimmed.length > ADJUSTMENT_REASON_MAX) return 'validation.maxLength'
  return undefined
}

// ---------------------------------------------------------------------------
// 4xx of the backend → French keys
// ---------------------------------------------------------------------------

/** Stable codes of contract v1.4 and their i18n keys (`users.errors.*`). */
const USER_ERROR_KEYS: Record<string, string> = {
  USER_NOT_FOUND: 'users.errors.notFound',
  INSUFFICIENT_COINS: 'users.errors.insufficientCoins',
  NEGATIVE_BALANCE: 'users.errors.insufficientCoins',
  USER_BLOCKED: 'users.errors.alreadyBlocked',
  USER_ALREADY_BLOCKED: 'users.errors.alreadyBlocked',
  USER_NOT_BLOCKED: 'users.errors.notBlocked',
  USER_DELETED: 'users.errors.deleted',
  REASON_REQUIRED: 'users.errors.reasonRequired',
  VALIDATION_ERROR: 'users.errors.validation',
}

/**
 * i18n key describing a failed user action, or `null` when the generic `notify.apiError`
 * message is good enough (5xx, network, 401/403 handled globally).
 */
export function userErrorKey(error: unknown): string | null {
  if (!ApiError.is(error)) return null
  if (error.code && USER_ERROR_KEYS[error.code]) return USER_ERROR_KEYS[error.code] as string
  if (error.status === 404) return 'users.errors.notFound'
  if (error.status === 409) return 'users.errors.conflict'
  if (error.status === 400 || error.status === 422) return 'users.errors.validation'
  return null
}
