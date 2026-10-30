import { describe, expect, it } from 'vitest'
import {
  bonusFromPercent,
  defaultWelcomeOffer,
  emptyLimitedOfferForm,
  emptyPromoCodeForm,
  generatePromoCode,
  generatePromoCodes,
  isPromoExhausted,
  isValidPromoCode,
  limitedOfferToForm,
  limitedOfferToInput,
  normalizePromoCode,
  offerState,
  packOfferBadge,
  promoCodeToInput,
  promoUsageRatio,
  sameWelcomeOffer,
  sortLimitedOffers,
  sortPromoCodes,
  validateLimitedOffer,
  validatePromoCode,
  validateWelcomeOffer,
  welcomeFormToInput,
  welcomeToForm,
} from '../utils/offers'
import type { CoinPack, LimitedOffer, PromoCode, PublicOffers } from '../types/api'

describe('offers — welcome offer (B-07, M-24)', () => {
  it('defaults to an inactive offer with a sensible bonus and window', () => {
    const base = defaultWelcomeOffer()
    expect(base.isActive).toBe(false)
    expect(base.bonusPercent).toBeGreaterThan(0)
    expect(base.hours).toBeGreaterThan(0)
  })

  it('validates the bonus percent and the hours window within their bounds', () => {
    expect(
      validateWelcomeOffer({ isActive: true, packSku: null, bonusPercent: 50, hours: 48 }),
    ).toEqual({})
    expect(
      validateWelcomeOffer({ isActive: true, packSku: null, bonusPercent: 0, hours: 0 }),
    ).toEqual({ bonusPercent: 'validation.positiveInteger', hours: 'validation.positiveInteger' })
    expect(
      validateWelcomeOffer({ isActive: true, packSku: null, bonusPercent: 9999, hours: 99999 }),
    ).toEqual({ bonusPercent: 'validation.max', hours: 'validation.max' })
  })

  it('round-trips form <-> wire and detects no change', () => {
    const offer = { isActive: true, packSku: 'coins_300', bonusPercent: 50, hours: 48 }
    const form = welcomeToForm(offer)
    expect(welcomeFormToInput(form)).toEqual(offer)
    expect(sameWelcomeOffer(welcomeFormToInput(form), offer)).toBe(true)
    expect(sameWelcomeOffer(welcomeFormToInput(form), { ...offer, bonusPercent: 10 })).toBe(false)
  })
})

describe('offers — limited offers (B-07, M-24)', () => {
  const pack: Pick<CoinPack, 'sku'> = { sku: 'coins_300' }

  it('requires a title, a pack, a bonus percent and an end date', () => {
    const errors = validateLimitedOffer(emptyLimitedOfferForm())
    expect(errors.title).toBe('validation.required')
    expect(errors.packSku).toBe('validation.required')
    expect(errors.endsAt).toBe('validation.required')
  })

  it('refuses an end date before the start date', () => {
    const errors = validateLimitedOffer({
      title: 'Promo',
      packSku: 'coins_300',
      bonusPercent: 20,
      startsAt: '2026-11-10T00:00:00.000Z',
      endsAt: '2026-11-01T00:00:00.000Z',
      isActive: true,
    })
    expect(errors.endsAt).toBe('validation.dateRange')
  })

  it('only sends the changed fields on edit, the full payload on create', () => {
    const existing: LimitedOffer = {
      id: 'off_1',
      title: 'Week-end',
      packSku: 'coins_300',
      bonusPercent: 20,
      startsAt: null,
      endsAt: '2026-11-10T00:00:00.000Z',
      isActive: true,
      createdAt: '2026-10-01T00:00:00.000Z',
    }
    const form = limitedOfferToForm(existing)
    expect(limitedOfferToInput(form, existing)).toEqual({})
    expect(limitedOfferToInput({ ...form, bonusPercent: 30 }, existing)).toEqual({
      bonusPercent: 30,
    })
    expect(Object.keys(limitedOfferToInput(form))).toContain('title')
  })

  it('computes the lifecycle state at a given instant', () => {
    const now = new Date('2026-10-30T12:00:00.000Z')
    const live: LimitedOffer = {
      id: '1',
      title: 't',
      packSku: 'coins_300',
      bonusPercent: 20,
      startsAt: '2026-10-29T00:00:00.000Z',
      endsAt: '2026-11-01T00:00:00.000Z',
      isActive: true,
      createdAt: now.toISOString(),
    }
    expect(offerState(live, now)).toBe('live')
    expect(offerState({ ...live, startsAt: '2026-11-05T00:00:00.000Z' }, now)).toBe('scheduled')
    expect(offerState({ ...live, endsAt: '2026-10-01T00:00:00.000Z' }, now)).toBe('ended')
    expect(offerState({ ...live, isActive: false }, now)).toBe('inactive')
  })

  it('sorts live first, then scheduled, then ended/inactive', () => {
    const now = new Date('2026-10-30T12:00:00.000Z')
    const base = {
      id: '',
      title: '',
      packSku: 'coins_300',
      bonusPercent: 10,
      createdAt: now.toISOString(),
    }
    const live: LimitedOffer = {
      ...base,
      id: 'live',
      startsAt: null,
      endsAt: '2026-11-05T00:00:00.000Z',
      isActive: true,
    }
    const scheduled: LimitedOffer = {
      ...base,
      id: 'scheduled',
      startsAt: '2026-11-10T00:00:00.000Z',
      endsAt: '2026-11-20T00:00:00.000Z',
      isActive: true,
    }
    const ended: LimitedOffer = {
      ...base,
      id: 'ended',
      startsAt: null,
      endsAt: '2026-10-01T00:00:00.000Z',
      isActive: true,
    }
    expect(sortLimitedOffers([ended, scheduled, live], now).map((o) => o.id)).toEqual([
      'live',
      'scheduled',
      'ended',
    ])
  })

  it('bonusFromPercent rounds down like the backend', () => {
    expect(bonusFromPercent(300, 30)).toBe(90)
    expect(bonusFromPercent(100, 33)).toBe(33)
    expect(bonusFromPercent(10, 33)).toBe(3)
  })

  it('packOfferBadge prefers the welcome offer over a limited one, respects expiry and pack scope', () => {
    const now = new Date('2026-10-30T12:00:00.000Z')
    const offers: PublicOffers = {
      welcome: { packSku: null, bonusPercent: 50, expiresAt: '2026-11-01T00:00:00.000Z' },
      limited: [
        {
          id: '1',
          title: 'Promo',
          packSku: 'coins_300',
          bonusPercent: 20,
          endsAt: '2026-11-05T00:00:00.000Z',
        },
      ],
    }
    expect(packOfferBadge({ sku: 'coins_300' }, offers, now)).toMatchObject({
      kind: 'welcome',
      bonusPercent: 50,
    })
    const expiredWelcome: PublicOffers = {
      ...offers,
      welcome: { ...offers.welcome!, expiresAt: '2026-10-01T00:00:00.000Z' },
    }
    expect(packOfferBadge({ sku: 'coins_300' }, expiredWelcome, now)).toMatchObject({
      kind: 'limited',
      bonusPercent: 20,
    })
    expect(packOfferBadge({ sku: 'coins_700' }, expiredWelcome, now)).toBeNull()
    expect(packOfferBadge({ sku: 'coins_300' }, null, now)).toBeNull()
    void pack
  })
})

describe('offers — promo codes and generator (M-24)', () => {
  it('normalises codes and validates the format', () => {
    expect(normalizePromoCode('drama 2026')).toBe('DRAMA2026')
    expect(isValidPromoCode('DRAMA2026')).toBe(true)
    expect(isValidPromoCode('AB')).toBe(false)
    expect(isValidPromoCode('abc-123')).toBe(false)
  })

  it('validates coins, quotas and date range, but skips the code on edit', () => {
    const form = { ...emptyPromoCodeForm(), code: '', coins: 0 }
    const errors = validatePromoCode(form)
    expect(errors.code).toBe('validation.required')
    expect(errors.coins).toBe('validation.positiveInteger')

    expect(validatePromoCode(form, true).code).toBeUndefined()

    const badRange = validatePromoCode({
      ...emptyPromoCodeForm(),
      code: 'ABCD',
      startsAt: '2026-11-10T00:00:00.000Z',
      endsAt: '2026-11-01T00:00:00.000Z',
    })
    expect(badRange.endsAt).toBe('validation.dateRange')
  })

  it('generates codes from a fixed alphabet (no ambiguous characters), with an optional prefix', () => {
    const code = generatePromoCode({
      prefix: 'drama-',
      length: 8,
      random: (n) => new Uint8Array(n).fill(5),
    })
    expect(code.startsWith('DRAMA-')).toBe(true)
    expect(isValidPromoCode(code)).toBe(true)
    expect(code).not.toMatch(/[O0I1]/)
  })

  it('generates several distinct codes', () => {
    const codes = generatePromoCodes(20)
    expect(codes).toHaveLength(20)
    expect(new Set(codes).size).toBe(20)
    codes.forEach((code) => expect(isValidPromoCode(code)).toBe(true))
  })

  it('creates the full payload, patches only changed fields and keeps the code immutable', () => {
    const existing: PromoCode = {
      id: 'p1',
      code: 'DRAMA2026',
      coins: 50,
      maxUses: 100,
      perUserUses: 1,
      startsAt: null,
      endsAt: null,
      isActive: true,
      usesCount: 2,
      createdAt: '2026-10-01T00:00:00.000Z',
    }
    const form = {
      ...emptyPromoCodeForm(),
      code: existing.code,
      coins: 50,
      maxUses: 100,
      perUserUses: 1,
    }
    expect(promoCodeToInput(form, existing)).toEqual({})
    expect(promoCodeToInput({ ...form, coins: 80 }, existing)).toEqual({ coins: 80 })
  })

  it('computes the usage ratio and exhaustion', () => {
    expect(promoUsageRatio({ usesCount: 50, maxUses: 100 })).toBe(0.5)
    expect(promoUsageRatio({ usesCount: 5, maxUses: null })).toBeNull()
    expect(isPromoExhausted({ usesCount: 100, maxUses: 100 })).toBe(true)
    expect(isPromoExhausted({ usesCount: 5, maxUses: null })).toBe(false)
  })

  it('sorts live codes first, then scheduled, then exhausted/ended last', () => {
    const now = new Date('2026-10-30T12:00:00.000Z')
    const base = {
      id: '',
      code: '',
      coins: 10,
      perUserUses: 1,
      usesCount: 0,
      createdAt: now.toISOString(),
    }
    const live: PromoCode = {
      ...base,
      id: 'live',
      code: 'LIVE',
      maxUses: 100,
      startsAt: null,
      endsAt: null,
      isActive: true,
    }
    const exhausted: PromoCode = {
      ...base,
      id: 'full',
      code: 'FULL',
      maxUses: 10,
      usesCount: 10,
      startsAt: null,
      endsAt: null,
      isActive: true,
    }
    const scheduled: PromoCode = {
      ...base,
      id: 'soon',
      code: 'SOON',
      maxUses: null,
      startsAt: '2026-11-10T00:00:00.000Z',
      endsAt: null,
      isActive: true,
    }
    expect(sortPromoCodes([exhausted, scheduled, live], now).map((p) => p.id)).toEqual([
      'live',
      'soon',
      'full',
    ])
  })
})
