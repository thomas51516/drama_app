import type {
  CoinPack,
  LimitedOffer,
  LimitedOfferInput,
  PromoCode,
  PromoCodeInput,
  PublicOffers,
  WelcomeOffer,
} from '../types/api'
import { PROMO_CODE_RE } from '../types/api'

/**
 * Pure helpers of the offers module (B-07, M-24, contract v1.5): the welcome offer, limited
 * offers on a pack, promo codes (with a generator) and what the app / recharge site show.
 * Validation returns i18n keys; components only translate.
 */

export const BONUS_PERCENT_MAX = 500
export const WELCOME_HOURS_MIN = 1
export const WELCOME_HOURS_MAX = 24 * 30
export const OFFER_TITLE_MAX = 80
export const PROMO_COINS_MAX = 100_000
export const PROMO_MAX_USES_MAX = 1_000_000
export const PROMO_PER_USER_MAX = 100

function isInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value)
}

function sameInstant(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b
  return new Date(a).getTime() === new Date(b).getTime()
}

// ---------------------------------------------------------------------------
// Welcome offer
// ---------------------------------------------------------------------------

export interface WelcomeOfferForm {
  isActive: boolean
  packSku: string | null
  bonusPercent: number | null
  hours: number | null
}

export type WelcomeOfferErrors = Partial<Record<'bonusPercent' | 'hours', string>>

export function defaultWelcomeOffer(): WelcomeOffer {
  return { isActive: false, packSku: null, bonusPercent: 50, hours: 48 }
}

export function welcomeToForm(offer: WelcomeOffer | null | undefined): WelcomeOfferForm {
  const base = offer ?? defaultWelcomeOffer()
  return {
    isActive: Boolean(base.isActive),
    packSku: base.packSku ?? null,
    bonusPercent: base.bonusPercent,
    hours: base.hours,
  }
}

export function validateWelcomeOffer(form: WelcomeOfferForm): WelcomeOfferErrors {
  const errors: WelcomeOfferErrors = {}
  if (!isInt(form.bonusPercent) || form.bonusPercent < 1) {
    errors.bonusPercent = 'validation.positiveInteger'
  } else if (form.bonusPercent > BONUS_PERCENT_MAX) {
    errors.bonusPercent = 'validation.max'
  }
  if (!isInt(form.hours) || form.hours < WELCOME_HOURS_MIN) {
    errors.hours = 'validation.positiveInteger'
  } else if (form.hours > WELCOME_HOURS_MAX) {
    errors.hours = 'validation.max'
  }
  return errors
}

export function welcomeFormToInput(form: WelcomeOfferForm): WelcomeOffer {
  return {
    isActive: form.isActive,
    packSku: form.packSku || null,
    bonusPercent: form.bonusPercent ?? 0,
    hours: form.hours ?? 0,
  }
}

export function sameWelcomeOffer(a: WelcomeOffer, b: WelcomeOffer): boolean {
  return (
    a.isActive === b.isActive &&
    (a.packSku ?? null) === (b.packSku ?? null) &&
    a.bonusPercent === b.bonusPercent &&
    a.hours === b.hours
  )
}

// ---------------------------------------------------------------------------
// Limited offers
// ---------------------------------------------------------------------------

export interface LimitedOfferForm {
  title: string
  packSku: string | null
  bonusPercent: number | null
  /** ISO UTC (converted from Lomé wall time by the component); `null` = starts now. */
  startsAt: string | null
  endsAt: string | null
  isActive: boolean
}

export type LimitedOfferErrors = Partial<Record<keyof LimitedOfferForm, string>>

export function emptyLimitedOfferForm(): LimitedOfferForm {
  return {
    title: '',
    packSku: null,
    bonusPercent: 20,
    startsAt: null,
    endsAt: null,
    isActive: true,
  }
}

export function limitedOfferToForm(offer: LimitedOffer): LimitedOfferForm {
  return {
    title: offer.title,
    packSku: offer.packSku,
    bonusPercent: offer.bonusPercent,
    startsAt: offer.startsAt ?? null,
    endsAt: offer.endsAt,
    isActive: offer.isActive,
  }
}

export function validateLimitedOffer(form: LimitedOfferForm): LimitedOfferErrors {
  const errors: LimitedOfferErrors = {}
  const title = form.title.trim()
  if (!title) errors.title = 'validation.required'
  else if (title.length > OFFER_TITLE_MAX) errors.title = 'validation.maxLength'
  if (!form.packSku) errors.packSku = 'validation.required'
  if (!isInt(form.bonusPercent) || form.bonusPercent < 1) {
    errors.bonusPercent = 'validation.positiveInteger'
  } else if (form.bonusPercent > BONUS_PERCENT_MAX) {
    errors.bonusPercent = 'validation.max'
  }
  if (!form.endsAt) errors.endsAt = 'validation.required'
  else if (Number.isNaN(new Date(form.endsAt).getTime())) errors.endsAt = 'validation.invalidDate'
  if (form.startsAt && Number.isNaN(new Date(form.startsAt).getTime())) {
    errors.startsAt = 'validation.invalidDate'
  }
  if (!errors.endsAt && !errors.startsAt && form.startsAt && form.endsAt) {
    if (new Date(form.endsAt).getTime() <= new Date(form.startsAt).getTime()) {
      errors.endsAt = 'validation.dateRange'
    }
  }
  return errors
}

/**
 * Full payload on create, changed fields only on edit. The contract reads "`startsAt` null
 * = starts now", but the backend actually requires a
 * valid ISO 8601 string (`VALIDATION_ERROR` otherwise, confirmed against the real API):
 * an empty start in the form is sent as the current instant rather than `null`.
 */
export function limitedOfferToInput(
  form: LimitedOfferForm,
  existing?: LimitedOffer,
): LimitedOfferInput {
  const full: LimitedOfferInput = {
    title: form.title.trim(),
    packSku: form.packSku ?? '',
    bonusPercent: form.bonusPercent ?? 0,
    startsAt: form.startsAt ?? new Date().toISOString(),
    endsAt: form.endsAt ?? '',
    isActive: form.isActive,
  }
  if (!existing) return full
  const patch: LimitedOfferInput = {}
  if (full.title !== existing.title) patch.title = full.title
  if (full.packSku !== existing.packSku) patch.packSku = full.packSku
  if (full.bonusPercent !== existing.bonusPercent) patch.bonusPercent = full.bonusPercent
  if (!sameInstant(form.startsAt, existing.startsAt)) patch.startsAt = full.startsAt
  if (full.endsAt !== existing.endsAt) patch.endsAt = full.endsAt
  if (full.isActive !== existing.isActive) patch.isActive = full.isActive
  return patch
}

export type OfferState = 'inactive' | 'scheduled' | 'live' | 'ended'

/** Lifecycle of an offer or a promo code at `now`. */
export function offerState(
  item: { isActive: boolean; startsAt?: string | null; endsAt?: string | null },
  now: Date = new Date(),
): OfferState {
  if (!item.isActive) return 'inactive'
  const time = now.getTime()
  if (item.startsAt && new Date(item.startsAt).getTime() > time) return 'scheduled'
  if (item.endsAt && new Date(item.endsAt).getTime() <= time) return 'ended'
  return 'live'
}

/** Live first, then scheduled (soonest first), then ended / inactive (latest first). */
export function sortLimitedOffers(
  offers: readonly LimitedOffer[],
  now: Date = new Date(),
): LimitedOffer[] {
  const rank: Record<OfferState, number> = { live: 0, scheduled: 1, inactive: 2, ended: 3 }
  return [...offers].sort((a, b) => {
    const diff = rank[offerState(a, now)] - rank[offerState(b, now)]
    if (diff !== 0) return diff
    return new Date(b.endsAt).getTime() - new Date(a.endsAt).getTime()
  })
}

// ---------------------------------------------------------------------------
// Promo codes
// ---------------------------------------------------------------------------

export interface PromoCodeForm {
  code: string
  coins: number | null
  /** `null` = unlimited. */
  maxUses: number | null
  perUserUses: number | null
  startsAt: string | null
  endsAt: string | null
  isActive: boolean
}

export type PromoCodeErrors = Partial<Record<keyof PromoCodeForm, string>>

export function emptyPromoCodeForm(): PromoCodeForm {
  return {
    code: '',
    coins: 50,
    maxUses: null,
    perUserUses: 1,
    startsAt: null,
    endsAt: null,
    isActive: true,
  }
}

export function promoCodeToForm(promo: PromoCode): PromoCodeForm {
  return {
    code: promo.code,
    coins: promo.coins,
    maxUses: promo.maxUses,
    perUserUses: promo.perUserUses,
    startsAt: promo.startsAt,
    endsAt: promo.endsAt,
    isActive: promo.isActive,
  }
}

/** Upper-cases and strips spaces so `drama 2026` becomes `DRAMA2026`. */
export function normalizePromoCode(raw: string): string {
  return raw.toUpperCase().replace(/\s+/g, '')
}

export function isValidPromoCode(code: string): boolean {
  return PROMO_CODE_RE.test(code)
}

export function validatePromoCode(form: PromoCodeForm, isEdit = false): PromoCodeErrors {
  const errors: PromoCodeErrors = {}
  if (!isEdit) {
    const code = normalizePromoCode(form.code)
    if (!code) errors.code = 'validation.required'
    else if (!isValidPromoCode(code)) errors.code = 'offers.validation.code'
  }
  if (!isInt(form.coins) || form.coins < 1) errors.coins = 'validation.positiveInteger'
  else if (form.coins > PROMO_COINS_MAX) errors.coins = 'validation.max'
  if (form.maxUses !== null) {
    if (!isInt(form.maxUses) || form.maxUses < 1) errors.maxUses = 'validation.positiveInteger'
    else if (form.maxUses > PROMO_MAX_USES_MAX) errors.maxUses = 'validation.max'
  }
  if (!isInt(form.perUserUses) || form.perUserUses < 1) {
    errors.perUserUses = 'validation.positiveInteger'
  } else if (form.perUserUses > PROMO_PER_USER_MAX) {
    errors.perUserUses = 'validation.max'
  }
  if (form.startsAt && Number.isNaN(new Date(form.startsAt).getTime())) {
    errors.startsAt = 'validation.invalidDate'
  }
  if (form.endsAt && Number.isNaN(new Date(form.endsAt).getTime())) {
    errors.endsAt = 'validation.invalidDate'
  }
  if (
    !errors.startsAt &&
    !errors.endsAt &&
    form.startsAt &&
    form.endsAt &&
    new Date(form.endsAt).getTime() <= new Date(form.startsAt).getTime()
  ) {
    errors.endsAt = 'validation.dateRange'
  }
  return errors
}

/** Full payload on create (code normalised), changed fields only on edit (code immutable). */
export function promoCodeToInput(form: PromoCodeForm, existing?: PromoCode): PromoCodeInput {
  const full: PromoCodeInput = {
    code: normalizePromoCode(form.code),
    coins: form.coins ?? 0,
    maxUses: form.maxUses,
    perUserUses: form.perUserUses ?? 1,
    startsAt: form.startsAt,
    endsAt: form.endsAt,
    isActive: form.isActive,
  }
  if (!existing) return full
  const patch: PromoCodeInput = {}
  if (full.coins !== existing.coins) patch.coins = full.coins
  if ((full.maxUses ?? null) !== (existing.maxUses ?? null)) patch.maxUses = full.maxUses
  if (full.perUserUses !== existing.perUserUses) patch.perUserUses = full.perUserUses
  if ((full.startsAt ?? null) !== (existing.startsAt ?? null)) patch.startsAt = full.startsAt
  if ((full.endsAt ?? null) !== (existing.endsAt ?? null)) patch.endsAt = full.endsAt
  if (full.isActive !== existing.isActive) patch.isActive = full.isActive
  return patch
}

/** Letters and digits that cannot be confused when read aloud or typed on a phone. */
export const PROMO_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export interface GeneratePromoOptions {
  /** Upper-cased, kept as-is at the start of the code (`DRAMA-` → `DRAMA-X7K2…`). */
  prefix?: string
  /** Random characters after the prefix (default 8, min 4, max 24). */
  length?: number
  /** Injectable for tests; defaults to `crypto.getRandomValues` when available. */
  random?: (count: number) => Uint8Array
}

function randomBytes(count: number): Uint8Array {
  const bytes = new Uint8Array(count)
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    crypto.getRandomValues(bytes)
  } else {
    for (let index = 0; index < count; index += 1) bytes[index] = Math.floor(Math.random() * 256)
  }
  return bytes
}

/** `DRAMA-K7M2X9PQ`: unambiguous alphabet, optional prefix, always a valid code. */
export function generatePromoCode(options: GeneratePromoOptions = {}): string {
  const length = Math.min(24, Math.max(4, Math.trunc(options.length ?? 8)))
  const prefix = normalizePromoCode(options.prefix ?? '').replace(/[^A-Z0-9_-]/g, '')
  const bytes = (options.random ?? randomBytes)(length)
  let body = ''
  for (let index = 0; index < length; index += 1) {
    body += PROMO_ALPHABET[(bytes[index] ?? 0) % PROMO_ALPHABET.length]
  }
  const code = `${prefix}${body}`
  // A prefix made of separators only would break the first-character rule: drop it.
  return isValidPromoCode(code) ? code : body
}

/** Several distinct codes at once (for a campaign); never returns duplicates. */
export function generatePromoCodes(count: number, options: GeneratePromoOptions = {}): string[] {
  const codes = new Set<string>()
  const wanted = Math.min(500, Math.max(1, Math.trunc(count)))
  let guard = 0
  while (codes.size < wanted && guard < wanted * 20) {
    codes.add(generatePromoCode(options))
    guard += 1
  }
  return [...codes]
}

/** `usesCount / maxUses` as a ratio in [0, 1], or null when unlimited. */
export function promoUsageRatio(promo: Pick<PromoCode, 'usesCount' | 'maxUses'>): number | null {
  if (promo.maxUses === null || promo.maxUses <= 0) return null
  return Math.min(1, promo.usesCount / promo.maxUses)
}

export function isPromoExhausted(promo: Pick<PromoCode, 'usesCount' | 'maxUses'>): boolean {
  return promo.maxUses !== null && promo.usesCount >= promo.maxUses
}

/** Sort: live first, then scheduled, then inactive / ended / exhausted; newest first inside. */
export function sortPromoCodes(codes: readonly PromoCode[], now: Date = new Date()): PromoCode[] {
  const rank = (promo: PromoCode): number => {
    if (isPromoExhausted(promo)) return 3
    const state = offerState(promo, now)
    return state === 'live' ? 0 : state === 'scheduled' ? 1 : 2
  }
  return [...codes].sort((a, b) => {
    const diff = rank(a) - rank(b)
    if (diff !== 0) return diff
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })
}

// ---------------------------------------------------------------------------
// What the app / recharge site show (public GET /offers)
// ---------------------------------------------------------------------------

export interface PackBadge {
  kind: 'welcome' | 'limited'
  bonusPercent: number
  /** Title of the limited offer (empty for the welcome offer). */
  title: string
  endsAt: string
}

/** Best offer badge for a pack: the welcome offer (if it applies) beats a limited offer. */
export function packOfferBadge(
  pack: Pick<CoinPack, 'sku'>,
  offers: PublicOffers | null | undefined,
  now: Date = new Date(),
): PackBadge | null {
  if (!offers) return null
  const time = now.getTime()
  const welcome = offers.welcome
  if (
    welcome &&
    new Date(welcome.expiresAt).getTime() > time &&
    (welcome.packSku === null || welcome.packSku === pack.sku)
  ) {
    return {
      kind: 'welcome',
      bonusPercent: welcome.bonusPercent,
      title: '',
      endsAt: welcome.expiresAt,
    }
  }
  const limited = (offers.limited ?? [])
    .filter((offer) => offer.packSku === pack.sku && new Date(offer.endsAt).getTime() > time)
    .sort((a, b) => b.bonusPercent - a.bonusPercent)[0]
  if (!limited) return null
  return {
    kind: 'limited',
    bonusPercent: limited.bonusPercent,
    title: limited.title,
    endsAt: limited.endsAt,
  }
}

/** Bonus coins a percentage adds on the paid coins (rounded down, like the backend). */
export function bonusFromPercent(coins: number, percent: number): number {
  return Math.floor((coins * percent) / 100)
}

/** Public shape of the admin offers for the mock `GET /offers` (active and live only). */
export function publicOffersFrom(
  welcome: WelcomeOffer,
  limited: readonly LimitedOffer[],
  accountCreatedAt: string | null,
  now: Date = new Date(),
): PublicOffers {
  let welcomePublic: PublicOffers['welcome'] = null
  if (welcome.isActive && accountCreatedAt) {
    const expiresAt = new Date(new Date(accountCreatedAt).getTime() + welcome.hours * 3_600_000)
    if (expiresAt.getTime() > now.getTime()) {
      welcomePublic = {
        packSku: welcome.packSku,
        bonusPercent: welcome.bonusPercent,
        expiresAt: expiresAt.toISOString(),
      }
    }
  }
  return {
    welcome: welcomePublic,
    limited: limited
      .filter((offer) => offerState(offer, now) === 'live')
      .map(({ id, title, packSku, bonusPercent, endsAt }) => ({
        id,
        title,
        packSku,
        bonusPercent,
        endsAt,
      })),
  }
}
