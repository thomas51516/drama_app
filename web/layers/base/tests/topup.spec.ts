import { describe, expect, it } from 'vitest'
import {
  bestValueSku,
  canRetry,
  effectiveStatus,
  isCompleteOtp,
  isCurrencyFallback,
  isExternalPaymentUrl,
  isRechargeCountry,
  isTopupStatus,
  isValidEmail,
  normalizePhone,
  orderId,
  orderStatusSeverity,
  orderTotalCoins,
  packBonusPercent,
  packPriceLabel,
  payStep,
  PAY_POLL_MAX_ATTEMPTS,
  pricePerCoin,
  resolveCountry,
  sortOrders,
} from '../utils/topup'
import type { CoinPack, TopupOrder } from '../types/api'

function pack(overrides: Partial<CoinPack> = {}): CoinPack {
  return {
    id: 'p1',
    sku: 'coins_300',
    coins: 300,
    bonusCoins: 30,
    price: { currency: 'XOF', amountMinor: 1500 },
    position: 1,
    ...overrides,
  }
}

describe('topup — countries and prices', () => {
  it('validates offered countries and resolves a sensible default', () => {
    expect(isRechargeCountry('TG')).toBe(true)
    expect(isRechargeCountry('ZZ')).toBe(false)
    expect(resolveCountry('GH', null)).toBe('GH')
    expect(resolveCountry(null, 'NG')).toBe('NG')
    expect(resolveCountry(null, 'ZZ')).toBe('TG')
    expect(resolveCountry(undefined, undefined)).toBe('TG')
  })

  it('formats a pack price in the user locale', () => {
    expect(packPriceLabel(pack())).toContain('500')
  })

  it('flags a currency fallback (country normally uses another currency)', () => {
    expect(isCurrencyFallback('NG', 'USD')).toBe(true)
    expect(isCurrencyFallback('NG', 'NGN')).toBe(false)
  })

  it('computes the bonus percent and the best-value pack', () => {
    expect(packBonusPercent(pack({ coins: 300, bonusCoins: 30 }))).toBe(10)
    expect(packBonusPercent(pack({ coins: 100, bonusCoins: 0 }))).toBeNull()

    const cheap = pack({
      sku: 'a',
      coins: 100,
      bonusCoins: 0,
      price: { currency: 'XOF', amountMinor: 600 },
    })
    const pricier = pack({
      sku: 'b',
      coins: 100,
      bonusCoins: 0,
      price: { currency: 'XOF', amountMinor: 1000 },
    })
    expect(pricePerCoin(cheap)).toBeLessThan(pricePerCoin(pricier))
    expect(bestValueSku([cheap, pricier])).toBe('a')
    expect(bestValueSku([cheap])).toBeNull()
  })
})

describe('topup — order state machine', () => {
  function order(overrides: Partial<TopupOrder> = {}): TopupOrder {
    return { orderId: 'ord_1', status: 'PENDING', coins: 330, creditedAt: null, ...overrides }
  }

  it('reads the order id from either field', () => {
    expect(orderId({ orderId: 'a', coins: 0, creditedAt: null, status: 'PENDING' })).toBe('a')
    expect(orderId({ id: 'b', coins: 0, creditedAt: null, status: 'PENDING' })).toBe('b')
  })

  it('treats a PENDING order past its expiry as EXPIRED', () => {
    const now = new Date('2026-10-30T12:00:00.000Z')
    expect(effectiveStatus(order({ expiresAt: '2026-10-30T11:00:00.000Z' }), now)).toBe('EXPIRED')
    expect(effectiveStatus(order({ expiresAt: '2026-10-30T13:00:00.000Z' }), now)).toBe('PENDING')
    expect(
      effectiveStatus(order({ status: 'PAID', expiresAt: '2026-10-30T11:00:00.000Z' }), now),
    ).toBe('PAID')
  })

  it('derives the pay-page step from the status and the return/attempt state', () => {
    expect(payStep('PAID', { returned: false, attempts: 0 })).toBe('paid')
    expect(payStep('FAILED', { returned: false, attempts: 0 })).toBe('failed')
    expect(payStep('EXPIRED', { returned: false, attempts: 0 })).toBe('expired')
    expect(payStep('PENDING', { returned: false, attempts: 0 })).toBe('ready')
    expect(payStep('PENDING', { returned: true, attempts: 1 })).toBe('waiting')
    expect(payStep('PENDING', { returned: true, attempts: PAY_POLL_MAX_ATTEMPTS })).toBe('timeout')
  })

  it('only offers a retry on failed, expired or timed-out steps', () => {
    expect(canRetry('failed')).toBe(true)
    expect(canRetry('expired')).toBe(true)
    expect(canRetry('timeout')).toBe(true)
    expect(canRetry('waiting')).toBe(false)
    expect(canRetry('paid')).toBe(false)
  })

  it('treats a relative payment url (mock page) as internal, an https one as external', () => {
    expect(isExternalPaymentUrl('https://provider.example/pay/123')).toBe(true)
    expect(isExternalPaymentUrl('/mock-payment/ord_1')).toBe(false)
  })

  it('sorts orders newest first and maps statuses to a tag severity', () => {
    const older = order({ orderId: 'old', createdAt: '2026-10-28T00:00:00.000Z' })
    const newer = order({ orderId: 'new', createdAt: '2026-10-29T00:00:00.000Z' })
    expect(sortOrders([older, newer]).map((o) => orderId(o))).toEqual(['new', 'old'])
    expect(orderStatusSeverity('PAID')).toBe('success')
    expect(orderStatusSeverity('FAILED')).toBe('danger')
    expect(orderStatusSeverity('EXPIRED')).toBe('secondary')
    expect(orderStatusSeverity('PENDING')).toBe('warn')
  })

  it('recognises a valid TopupOrderStatus', () => {
    expect(isTopupStatus('PAID')).toBe(true)
    expect(isTopupStatus('NOPE')).toBe(false)
  })

  it('sums the base and bonus coins the real API reports separately', () => {
    expect(orderTotalCoins({ coins: 300, bonusCoins: 30 })).toBe(330)
    expect(orderTotalCoins({ coins: 300 })).toBe(300)
    expect(orderTotalCoins({ coins: 300, bonusCoins: 0 })).toBe(300)
  })
})

describe('topup — phone, OTP, e-mail', () => {
  it('normalises phone numbers to E.164 and rejects the rest', () => {
    expect(normalizePhone('+228 90 12 34 56')).toBe('+22890123456')
    expect(normalizePhone('00228 90123456')).toBe('+22890123456')
    expect(normalizePhone('90123456')).toBeNull()
    expect(normalizePhone('not a phone')).toBeNull()
  })

  it('validates a complete 6-digit OTP', () => {
    expect(isCompleteOtp('123456')).toBe(true)
    expect(isCompleteOtp('12345')).toBe(false)
    expect(isCompleteOtp('12345a')).toBe(false)
  })

  it('validates an e-mail address loosely but usefully', () => {
    expect(isValidEmail('awa@example.com')).toBe(true)
    expect(isValidEmail('not-an-email')).toBe(false)
  })
})
