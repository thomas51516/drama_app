import type {
  AdminRole,
  CoinPackAdmin,
  CoinPackInput,
  Currency,
  MonetizationSettings,
  Price,
  VipPeriod,
  VipPlanAdmin,
  VipPlanInput,
} from '../types/api'
import { CURRENCIES, SKU_RE, VIP_PERIODS } from '../types/api'

/**
 * Pure helpers of the monetization module (B-06, contract v1.4): role gating, prices per
 * currency (minor units, indicative rates from XOF), what the app will show for a country,
 * and the forms of the settings, coin packs and VIP plans. Error codes are i18n keys.
 */

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

/** Monetization and rewards are restricted to MONETIZATION and ADMIN (contract v1.4). */
export function canManageMonetization(role: AdminRole | null | undefined): boolean {
  return role === 'MONETIZATION' || role === 'ADMIN'
}

// ---------------------------------------------------------------------------
// Currencies and prices
// ---------------------------------------------------------------------------

/** Reference currency of the shop: every other price is derived from it when the editor asks. */
export const BASE_CURRENCY: Currency = 'XOF'

/** Number of decimals of the minor unit (`amountMinor`) per currency. */
export const CURRENCY_DECIMALS: Record<Currency, number> = {
  XOF: 0,
  NGN: 2,
  GHS: 2,
  EUR: 2,
  USD: 2,
}

/**
 * Indicative rates: 1 XOF → x units of the target currency (major unit). They only pre-fill
 * the form; the editor sees and can change them, and every stored price is explicit.
 */
export const DEFAULT_RATES_FROM_XOF: Record<Currency, number> = {
  XOF: 1,
  NGN: 2.5,
  GHS: 0.025,
  EUR: 1 / 655.957,
  USD: 0.00165,
}

export type RatesFromXof = Record<Currency, number>

/**
 * Currency shown by the app per country (`GET /shop` with `X-Country`), USD elsewhere.
 * UEMOA → XOF, Nigeria → NGN, Ghana → GHS, euro area → EUR.
 */
export const COUNTRY_CURRENCY: Readonly<Record<string, Currency>> = {
  BJ: 'XOF',
  BF: 'XOF',
  CI: 'XOF',
  GW: 'XOF',
  ML: 'XOF',
  NE: 'XOF',
  SN: 'XOF',
  TG: 'XOF',
  NG: 'NGN',
  GH: 'GHS',
  AT: 'EUR',
  BE: 'EUR',
  CY: 'EUR',
  DE: 'EUR',
  EE: 'EUR',
  ES: 'EUR',
  FI: 'EUR',
  FR: 'EUR',
  GR: 'EUR',
  HR: 'EUR',
  IE: 'EUR',
  IT: 'EUR',
  LT: 'EUR',
  LU: 'EUR',
  LV: 'EUR',
  MT: 'EUR',
  NL: 'EUR',
  PT: 'EUR',
  SI: 'EUR',
  SK: 'EUR',
  US: 'USD',
}

export const FALLBACK_CURRENCY: Currency = 'USD'

/** Currency the app displays for a country (upper-cased ISO code), USD when unknown. */
export function currencyForCountry(country: string | null | undefined): Currency {
  if (!country) return FALLBACK_CURRENCY
  return COUNTRY_CURRENCY[country.trim().toUpperCase()] ?? FALLBACK_CURRENCY
}

export function isCurrency(value: unknown): value is Currency {
  return typeof value === 'string' && (CURRENCIES as readonly string[]).includes(value)
}

/** Minor units → major units (`1500` XOF → 1500, `299` EUR → 2.99). */
export function toMajor(amountMinor: number, currency: Currency): number {
  return amountMinor / 10 ** CURRENCY_DECIMALS[currency]
}

/** Major units → minor units, rounded (`2.99` EUR → 299). */
export function toMinor(amountMajor: number, currency: Currency): number {
  return Math.round(amountMajor * 10 ** CURRENCY_DECIMALS[currency])
}

/** `1 500 F CFA`, `2,99 €`… with the locale's formatting; XOF is printed without decimals. */
export function formatPrice(price: Price | null | undefined, locale = 'fr'): string {
  if (!price) return '—'
  const decimals = CURRENCY_DECIMALS[price.currency]
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: price.currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(toMajor(price.amountMinor, price.currency))
}

/** Price of a list in the given currency, or the USD fallback, or null. */
export function priceFor(prices: readonly Price[], currency: Currency): Price | null {
  return (
    prices.find((price) => price.currency === currency) ??
    prices.find((price) => price.currency === FALLBACK_CURRENCY) ??
    null
  )
}

/** Editable form of prices: major-unit amounts per currency, `null` when not set. */
export type PriceForm = Record<Currency, number | null>

export function emptyPriceForm(): PriceForm {
  return { XOF: null, NGN: null, GHS: null, EUR: null, USD: null }
}

export function pricesToForm(prices: readonly Price[]): PriceForm {
  const form = emptyPriceForm()
  for (const price of prices) {
    if (isCurrency(price.currency))
      form[price.currency] = toMajor(price.amountMinor, price.currency)
  }
  return form
}

/** Only the currencies with an amount; order of `CURRENCIES`. */
export function formToPrices(form: PriceForm): Price[] {
  return CURRENCIES.filter((currency) => form[currency] !== null && form[currency] !== undefined)
    .filter((currency) => Number.isFinite(form[currency]))
    .map((currency) => ({ currency, amountMinor: toMinor(form[currency] as number, currency) }))
}

/**
 * Rounding that gives "shop-looking" prices: XOF to the nearest 5, NGN and GHS to the nearest
 * unit, EUR and USD to the nearest 0.05 (no `.99` games: the editor decides).
 */
export function roundShopAmount(amountMajor: number, currency: Currency): number {
  switch (currency) {
    case 'XOF':
      return Math.max(5, Math.round(amountMajor / 5) * 5)
    case 'NGN':
    case 'GHS':
      return Math.max(1, Math.round(amountMajor))
    case 'EUR':
    case 'USD':
      return Math.max(0.05, Math.round(amountMajor * 20) / 20)
  }
}

/**
 * Fill the other currencies from the XOF amount with the indicative rates. Currencies already
 * filled are kept unless `overwrite` is true. Returns a new form; a missing XOF amount returns
 * the form unchanged.
 */
export function fillPricesFromXof(
  form: PriceForm,
  rates: RatesFromXof = DEFAULT_RATES_FROM_XOF,
  overwrite = false,
): PriceForm {
  const xof = form.XOF
  if (xof === null || xof === undefined || !Number.isFinite(xof) || xof <= 0) return { ...form }
  const next: PriceForm = { ...form }
  for (const currency of CURRENCIES) {
    if (currency === BASE_CURRENCY) continue
    if (!overwrite && next[currency] !== null && next[currency] !== undefined) continue
    next[currency] = roundShopAmount(xof * rates[currency], currency)
  }
  return next
}

// ---------------------------------------------------------------------------
// Simulator: what the app displays for a country
// ---------------------------------------------------------------------------

export interface ShopDisplay {
  currency: Currency
  /** `null` when the pack has no price in that currency nor in USD (the app hides it). */
  price: Price | null
  /** True when the price shown is the USD fallback, not the country's currency. */
  fallback: boolean
  coins: number
  bonusCoins: number
  totalCoins: number
  /** Price per coin in minor units, for comparison between packs. */
  minorPerCoin: number | null
}

export function simulateShopDisplay(
  pack: Pick<CoinPackAdmin, 'coins' | 'bonusCoins' | 'prices'>,
  country: string | null | undefined,
): ShopDisplay {
  const currency = currencyForCountry(country)
  const price = priceFor(pack.prices, currency)
  const totalCoins = pack.coins + pack.bonusCoins
  return {
    currency,
    price,
    fallback: price !== null && price.currency !== currency,
    coins: pack.coins,
    bonusCoins: pack.bonusCoins,
    totalCoins,
    minorPerCoin: price && totalCoins > 0 ? price.amountMinor / totalCoins : null,
  }
}

// ---------------------------------------------------------------------------
// Settings form
// ---------------------------------------------------------------------------

export type SettingsErrors = Partial<Record<keyof MonetizationSettings, string>>

export const SETTINGS_LIMITS = {
  defaultFreeEpisodes: { min: 0, max: 50 },
  defaultCoinCost: { min: 1, max: 1000 },
  seriesUnlockDiscountPercent: { min: 0, max: 90 },
  adDailyCap: { min: 0, max: 50 },
  bonusValidityDays: { min: 1, max: 365 },
} as const

function integerError(value: unknown, min: number, max: number): string | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value)) return 'validation.nonNegativeInteger'
  if (value < min) return 'validation.min'
  if (value > max) return 'validation.max'
  return undefined
}

export function validateSettings(values: MonetizationSettings): SettingsErrors {
  const errors: SettingsErrors = {}
  for (const key of Object.keys(SETTINGS_LIMITS) as (keyof typeof SETTINGS_LIMITS)[]) {
    const { min, max } = SETTINGS_LIMITS[key]
    const error = integerError(values[key], min, max)
    if (error) errors[key] = error
  }
  if (typeof values.autoUnlockDefault !== 'boolean')
    errors.autoUnlockDefault = 'validation.required'
  return errors
}

/** Only the changed fields, so the audit line shows what moved. */
export function settingsPatch(
  before: MonetizationSettings,
  after: MonetizationSettings,
): Partial<MonetizationSettings> {
  const patch: Partial<MonetizationSettings> = {}
  for (const key of Object.keys(after) as (keyof MonetizationSettings)[]) {
    if (before[key] !== after[key]) {
      ;(patch as Record<string, unknown>)[key] = after[key]
    }
  }
  return patch
}

// ---------------------------------------------------------------------------
// Coin pack form
// ---------------------------------------------------------------------------

export interface PackFormValues {
  sku: string
  coins: number | null
  bonusCoins: number | null
  badge: string
  isActive: boolean
  prices: PriceForm
}

export type PackFormErrors = Partial<
  Record<keyof Omit<PackFormValues, 'prices'> | 'prices', string>
>

export const BADGE_MAX = 30
export const COINS_MAX = 100_000

export function emptyPackForm(): PackFormValues {
  return {
    sku: '',
    coins: null,
    bonusCoins: 0,
    badge: '',
    isActive: true,
    prices: emptyPriceForm(),
  }
}

export function packToForm(pack: CoinPackAdmin): PackFormValues {
  return {
    sku: pack.sku,
    coins: pack.coins,
    bonusCoins: pack.bonusCoins,
    badge: pack.badge ?? '',
    isActive: pack.isActive,
    prices: pricesToForm(pack.prices),
  }
}

export function isValidSku(sku: string): boolean {
  return SKU_RE.test(sku)
}

function pricesError(form: PriceForm): string | undefined {
  const prices = formToPrices(form)
  if (prices.length === 0) return 'monetization.validation.priceRequired'
  if (prices.some((price) => price.amountMinor <= 0)) return 'monetization.validation.pricePositive'
  if (!prices.some((price) => price.currency === BASE_CURRENCY)) {
    return 'monetization.validation.priceXofRequired'
  }
  return undefined
}

export function validatePackForm(values: PackFormValues, isEdit = false): PackFormErrors {
  const errors: PackFormErrors = {}
  if (!isEdit) {
    const sku = values.sku.trim()
    if (!sku) errors.sku = 'validation.required'
    else if (!isValidSku(sku)) errors.sku = 'monetization.validation.sku'
  }
  if (values.coins === null || values.coins === undefined) {
    errors.coins = 'validation.required'
  } else {
    const coins = integerError(values.coins, 1, COINS_MAX)
    if (coins)
      errors.coins = coins === 'validation.min' ? 'monetization.validation.coinsMin' : coins
  }
  const bonus = integerError(values.bonusCoins ?? 0, 0, COINS_MAX)
  if (bonus) errors.bonusCoins = bonus
  if (values.badge.trim().length > BADGE_MAX) errors.badge = 'validation.maxLength'
  const prices = pricesError(values.prices)
  if (prices) errors.prices = prices
  return errors
}

/** Create payload (every field, `sku` included) or patch (changed fields, never `sku`). */
export function packFormToInput(values: PackFormValues, existing?: CoinPackAdmin): CoinPackInput {
  const full: Required<Omit<CoinPackInput, 'sku'>> = {
    coins: values.coins ?? 0,
    bonusCoins: values.bonusCoins ?? 0,
    badge: values.badge.trim() || null,
    isActive: values.isActive,
    prices: formToPrices(values.prices),
  }
  if (!existing) return { sku: values.sku.trim(), ...full }
  const patch: CoinPackInput = {}
  if (full.coins !== existing.coins) patch.coins = full.coins
  if (full.bonusCoins !== existing.bonusCoins) patch.bonusCoins = full.bonusCoins
  if (full.badge !== (existing.badge ?? null)) patch.badge = full.badge
  if (full.isActive !== existing.isActive) patch.isActive = full.isActive
  if (!samePrices(full.prices, existing.prices)) patch.prices = full.prices
  return patch
}

export function samePrices(a: readonly Price[], b: readonly Price[]): boolean {
  if (a.length !== b.length) return false
  const key = (list: readonly Price[]): string =>
    [...list]
      .sort((x, y) => x.currency.localeCompare(y.currency))
      .map((price) => `${price.currency}:${price.amountMinor}`)
      .join('|')
  return key(a) === key(b)
}

// ---------------------------------------------------------------------------
// VIP plan form
// ---------------------------------------------------------------------------

export interface VipPlanFormValues {
  sku: string
  period: VipPeriod
  trialDays: number | null
  badge: string
  isActive: boolean
  prices: PriceForm
}

export type VipPlanFormErrors = Partial<
  Record<keyof Omit<VipPlanFormValues, 'prices'> | 'prices', string>
>

export const TRIAL_DAYS_MAX = 90

export function emptyVipPlanForm(): VipPlanFormValues {
  return {
    sku: '',
    period: 'MONTH',
    trialDays: 0,
    badge: '',
    isActive: true,
    prices: emptyPriceForm(),
  }
}

export function vipPlanToForm(plan: VipPlanAdmin): VipPlanFormValues {
  return {
    sku: plan.sku,
    period: plan.period,
    trialDays: plan.trialDays,
    badge: plan.badge ?? '',
    isActive: plan.isActive,
    prices: pricesToForm(plan.prices),
  }
}

export function isVipPeriod(value: unknown): value is VipPeriod {
  return typeof value === 'string' && (VIP_PERIODS as readonly string[]).includes(value)
}

export function validateVipPlanForm(values: VipPlanFormValues, isEdit = false): VipPlanFormErrors {
  const errors: VipPlanFormErrors = {}
  if (!isEdit) {
    const sku = values.sku.trim()
    if (!sku) errors.sku = 'validation.required'
    else if (!isValidSku(sku)) errors.sku = 'monetization.validation.sku'
  }
  if (!isVipPeriod(values.period)) errors.period = 'validation.unknownValue'
  const trial = integerError(values.trialDays ?? 0, 0, TRIAL_DAYS_MAX)
  if (trial) errors.trialDays = trial
  if (values.badge.trim().length > BADGE_MAX) errors.badge = 'validation.maxLength'
  const prices = pricesError(values.prices)
  if (prices) errors.prices = prices
  return errors
}

export function vipPlanFormToInput(
  values: VipPlanFormValues,
  existing?: VipPlanAdmin,
): VipPlanInput {
  const full: Required<Omit<VipPlanInput, 'sku'>> = {
    period: values.period,
    trialDays: values.trialDays ?? 0,
    badge: values.badge.trim() || null,
    isActive: values.isActive,
    prices: formToPrices(values.prices),
  }
  if (!existing) return { sku: values.sku.trim(), ...full }
  const patch: VipPlanInput = {}
  if (full.period !== existing.period) patch.period = full.period
  if (full.trialDays !== existing.trialDays) patch.trialDays = full.trialDays
  if (full.badge !== (existing.badge ?? null)) patch.badge = full.badge
  if (full.isActive !== existing.isActive) patch.isActive = full.isActive
  if (!samePrices(full.prices, existing.prices)) patch.prices = full.prices
  return patch
}

/** Plans in a stable order: by position when the API sends one, else week → month → year. */
export function sortVipPlans(plans: readonly VipPlanAdmin[]): VipPlanAdmin[] {
  const rank: Record<VipPeriod, number> = { WEEK: 0, MONTH: 1, YEAR: 2 }
  return [...plans].sort((a, b) => {
    if (typeof a.position === 'number' && typeof b.position === 'number') {
      return a.position - b.position
    }
    return (rank[a.period] ?? 9) - (rank[b.period] ?? 9) || a.sku.localeCompare(b.sku)
  })
}
