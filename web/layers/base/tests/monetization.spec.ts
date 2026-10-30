import { describe, expect, it } from 'vitest'
import type { CoinPackAdmin } from '../types/api'
import {
  COUNTRY_CURRENCY,
  DEFAULT_RATES_FROM_XOF,
  canManageMonetization,
  currencyForCountry,
  emptyPackForm,
  emptyPriceForm,
  fillPricesFromXof,
  formToPrices,
  formatPrice,
  packFormToInput,
  priceFor,
  pricesToForm,
  roundShopAmount,
  samePrices,
  settingsPatch,
  simulateShopDisplay,
  sortVipPlans,
  toMajor,
  toMinor,
  validatePackForm,
  validateSettings,
  validateVipPlanForm,
  vipPlanFormToInput,
} from '../utils/monetization'

const pack: CoinPackAdmin = {
  id: 'pack_1',
  sku: 'coins_300',
  coins: 300,
  bonusCoins: 30,
  badge: 'Populaire',
  position: 1,
  isActive: true,
  createdAt: '2026-10-01T00:00:00.000Z',
  price: { currency: 'XOF', amountMinor: 1500 },
  prices: [
    { currency: 'XOF', amountMinor: 1500 },
    { currency: 'EUR', amountMinor: 229 },
    { currency: 'USD', amountMinor: 249 },
  ],
}

describe('monetization — roles', () => {
  it('opens the module to MONETIZATION and ADMIN only', () => {
    expect(canManageMonetization('MONETIZATION')).toBe(true)
    expect(canManageMonetization('ADMIN')).toBe(true)
    expect(canManageMonetization('EDITOR')).toBe(false)
    expect(canManageMonetization('SUPPORT')).toBe(false)
    expect(canManageMonetization(null)).toBe(false)
  })
})

describe('monetization — currency map', () => {
  it('maps UEMOA countries to XOF, Nigeria to NGN, Ghana to GHS, euro area to EUR', () => {
    expect(currencyForCountry('TG')).toBe('XOF')
    expect(currencyForCountry('ci')).toBe('XOF')
    expect(currencyForCountry('NG')).toBe('NGN')
    expect(currencyForCountry('GH')).toBe('GHS')
    expect(currencyForCountry('FR')).toBe('EUR')
    expect(currencyForCountry('PT')).toBe('EUR')
  })

  it('falls back to USD for unknown or missing countries', () => {
    expect(currencyForCountry('US')).toBe('USD')
    expect(currencyForCountry('KE')).toBe('USD')
    expect(currencyForCountry(null)).toBe('USD')
    expect(currencyForCountry('')).toBe('USD')
    expect(Object.values(COUNTRY_CURRENCY)).not.toContain('XXX')
  })
})

describe('monetization — minor units and formatting', () => {
  it('converts XOF without decimals and the others with two', () => {
    expect(toMajor(1500, 'XOF')).toBe(1500)
    expect(toMajor(229, 'EUR')).toBe(2.29)
    expect(toMinor(2.29, 'EUR')).toBe(229)
    expect(toMinor(1500, 'XOF')).toBe(1500)
    expect(toMinor(1234.5, 'NGN')).toBe(123450)
  })

  it('formats prices with the currency and the right number of decimals', () => {
    expect(formatPrice({ currency: 'XOF', amountMinor: 1500 }, 'fr')).toMatch(/1\s?500/)
    expect(formatPrice({ currency: 'XOF', amountMinor: 1500 }, 'fr')).not.toMatch(/,00/)
    expect(formatPrice({ currency: 'EUR', amountMinor: 229 }, 'fr')).toMatch(/2,29/)
    expect(formatPrice({ currency: 'USD', amountMinor: 249 }, 'en')).toBe('$2.49')
    expect(formatPrice(null)).toBe('—')
  })

  it('round-trips a price list through the form', () => {
    const form = pricesToForm(pack.prices)
    expect(form).toEqual({ XOF: 1500, NGN: null, GHS: null, EUR: 2.29, USD: 2.49 })
    expect(formToPrices(form)).toEqual(pack.prices)
    expect(samePrices(formToPrices(form), [...pack.prices].reverse())).toBe(true)
  })

  it('rounds shop amounts per currency', () => {
    expect(roundShopAmount(1498, 'XOF')).toBe(1500)
    expect(roundShopAmount(3.37, 'NGN')).toBe(3)
    expect(roundShopAmount(2.287, 'EUR')).toBe(2.3)
    expect(roundShopAmount(0.001, 'USD')).toBe(0.05)
  })
})

describe('monetization — fill from XOF', () => {
  it('fills the empty currencies from the XOF amount with the indicative rates', () => {
    const filled = fillPricesFromXof({ ...emptyPriceForm(), XOF: 1500 })
    expect(filled.XOF).toBe(1500)
    expect(filled.NGN).toBe(roundShopAmount(1500 * DEFAULT_RATES_FROM_XOF.NGN, 'NGN'))
    expect(filled.GHS).toBe(roundShopAmount(1500 * DEFAULT_RATES_FROM_XOF.GHS, 'GHS'))
    expect(filled.EUR).toBe(roundShopAmount(1500 * DEFAULT_RATES_FROM_XOF.EUR, 'EUR'))
    expect(filled.USD).toBe(roundShopAmount(1500 * DEFAULT_RATES_FROM_XOF.USD, 'USD'))
    expect(filled.EUR).toBeCloseTo(2.3, 2)
    expect(filled.USD).toBeCloseTo(2.5, 2)
  })

  it('keeps the amounts already typed unless overwrite is asked', () => {
    const form = { ...emptyPriceForm(), XOF: 1500, EUR: 1.99 }
    expect(fillPricesFromXof(form).EUR).toBe(1.99)
    expect(fillPricesFromXof(form, DEFAULT_RATES_FROM_XOF, true).EUR).not.toBe(1.99)
  })

  it('uses the editable rates and does nothing without a XOF amount', () => {
    const form = { ...emptyPriceForm(), XOF: 1000 }
    const custom = { ...DEFAULT_RATES_FROM_XOF, NGN: 3 }
    expect(fillPricesFromXof(form, custom).NGN).toBe(3000)
    expect(fillPricesFromXof(emptyPriceForm())).toEqual(emptyPriceForm())
    expect(fillPricesFromXof({ ...emptyPriceForm(), XOF: 0 }).EUR).toBeNull()
  })
})

describe('monetization — simulator', () => {
  it('shows the price in the country currency, coins and bonus', () => {
    const display = simulateShopDisplay(pack, 'FR')
    expect(display).toMatchObject({
      currency: 'EUR',
      price: { currency: 'EUR', amountMinor: 229 },
      fallback: false,
      coins: 300,
      bonusCoins: 30,
      totalCoins: 330,
    })
    expect(display.minorPerCoin).toBeCloseTo(229 / 330, 5)
  })

  it('falls back to USD when the country currency has no price, and hides the pack without USD', () => {
    expect(simulateShopDisplay(pack, 'NG')).toMatchObject({
      currency: 'NGN',
      price: { currency: 'USD', amountMinor: 249 },
      fallback: true,
    })
    const xofOnly = { ...pack, prices: [{ currency: 'XOF' as const, amountMinor: 1500 }] }
    expect(simulateShopDisplay(xofOnly, 'NG')).toMatchObject({ price: null, minorPerCoin: null })
    expect(priceFor(xofOnly.prices, 'GHS')).toBeNull()
  })
})

describe('monetization — settings form', () => {
  const settings = {
    defaultFreeEpisodes: 3,
    defaultCoinCost: 10,
    seriesUnlockDiscountPercent: 20,
    adDailyCap: 5,
    autoUnlockDefault: false,
    bonusValidityDays: 30,
  }

  it('accepts the defaults and refuses out-of-range or non-integer values', () => {
    expect(validateSettings(settings)).toEqual({})
    expect(validateSettings({ ...settings, defaultCoinCost: 0 })).toMatchObject({
      defaultCoinCost: 'validation.min',
    })
    expect(validateSettings({ ...settings, seriesUnlockDiscountPercent: 95 })).toMatchObject({
      seriesUnlockDiscountPercent: 'validation.max',
    })
    expect(validateSettings({ ...settings, adDailyCap: 1.5 })).toMatchObject({
      adDailyCap: 'validation.nonNegativeInteger',
    })
  })

  it('computes the patch of changed fields only', () => {
    expect(settingsPatch(settings, settings)).toEqual({})
    expect(
      settingsPatch(settings, { ...settings, adDailyCap: 3, autoUnlockDefault: true }),
    ).toEqual({ adDailyCap: 3, autoUnlockDefault: true })
  })
})

describe('monetization — pack and VIP forms', () => {
  it('requires a valid sku on creation, coins ≥ 1 and a XOF price', () => {
    const empty = validatePackForm(emptyPackForm())
    expect(empty).toMatchObject({
      sku: 'validation.required',
      coins: 'validation.required',
      prices: 'monetization.validation.priceRequired',
    })
    expect(validatePackForm({ ...emptyPackForm(), coins: 0 }).coins).toBe(
      'monetization.validation.coinsMin',
    )
    const bad = validatePackForm({
      ...emptyPackForm(),
      sku: 'Coins 300',
      coins: 100,
      prices: { ...emptyPriceForm(), EUR: 2 },
    })
    expect(bad.sku).toBe('monetization.validation.sku')
    expect(bad.prices).toBe('monetization.validation.priceXofRequired')
    const ok = validatePackForm({
      ...emptyPackForm(),
      sku: 'coins_300',
      coins: 300,
      prices: { ...emptyPriceForm(), XOF: 1500 },
    })
    expect(ok).toEqual({})
  })

  it('ignores the sku when editing and builds a minimal patch', () => {
    const form = { ...emptyPackForm(), sku: '', coins: 300, bonusCoins: 30, badge: 'Populaire' }
    form.prices = pricesToForm(pack.prices)
    expect(validatePackForm(form, true)).toEqual({})
    expect(packFormToInput(form, pack)).toEqual({})
    form.bonusCoins = 50
    form.isActive = false
    expect(packFormToInput(form, pack)).toEqual({ bonusCoins: 50, isActive: false })
    const created = packFormToInput({ ...form, sku: ' coins_700 ' })
    expect(created.sku).toBe('coins_700')
    expect(created.prices).toEqual(pack.prices)
  })

  it('validates VIP plans (period, trial days) and sorts them week → month → year', () => {
    const errors = validateVipPlanForm({
      sku: 'vip_month',
      period: 'MONTH',
      trialDays: -1,
      badge: '',
      isActive: true,
      prices: { ...emptyPriceForm(), XOF: 3000 },
    })
    expect(errors).toMatchObject({ trialDays: 'validation.min' })
    const input = vipPlanFormToInput({
      sku: 'vip_year',
      period: 'YEAR',
      trialDays: 7,
      badge: ' -40 % ',
      isActive: true,
      prices: { ...emptyPriceForm(), XOF: 22000 },
    })
    expect(input).toEqual({
      sku: 'vip_year',
      period: 'YEAR',
      trialDays: 7,
      badge: '-40 %',
      isActive: true,
      prices: [{ currency: 'XOF', amountMinor: 22000 }],
    })
    const base = {
      prices: [],
      isActive: true,
      trialDays: 0,
      price: { currency: 'XOF' as const, amountMinor: 1 },
    }
    const sorted = sortVipPlans([
      { id: 'y', sku: 'vip_year', period: 'YEAR', ...base },
      { id: 'w', sku: 'vip_week', period: 'WEEK', ...base },
      { id: 'm', sku: 'vip_month', period: 'MONTH', ...base },
    ])
    expect(sorted.map((plan) => plan.period)).toEqual(['WEEK', 'MONTH', 'YEAR'])
  })
})
