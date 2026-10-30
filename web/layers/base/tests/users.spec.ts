import { describe, expect, it } from 'vitest'
import { ApiError } from '../utils/api-error'
import {
  adjustmentPreview,
  adjustmentToInput,
  canManageUsers,
  emptyAdjustmentForm,
  isSearchable,
  normalizeUnlockMethod,
  paginate,
  signedAmount,
  sortLedger,
  summaryCoins,
  userErrorKey,
  userLabel,
  validateAdjustment,
  validateReason,
} from '../utils/users'

const wallet = { purchased: 180, bonus: 45 }

describe('users — roles, labels and search', () => {
  it('opens the module to SUPPORT and ADMIN only', () => {
    expect(canManageUsers('SUPPORT')).toBe(true)
    expect(canManageUsers('ADMIN')).toBe(true)
    expect(canManageUsers('MONETIZATION')).toBe(false)
    expect(canManageUsers('EDITOR')).toBe(false)
  })

  it('labels a user by name, else e-mail, else phone, else short id', () => {
    const base = { id: '0192f3a0-7c1e-7a10-8e00-000000000001' }
    expect(userLabel({ ...base, displayName: 'Awa', email: 'a@x.io', phone: null })).toBe('Awa')
    expect(userLabel({ ...base, displayName: ' ', email: 'a@x.io', phone: null })).toBe('a@x.io')
    expect(userLabel({ ...base, displayName: null, email: null, phone: '+228' })).toBe('+228')
    expect(userLabel({ ...base, displayName: null, email: null, phone: null })).toBe('0192f3a0…')
  })

  it('reads the total coins from `balance` or the flat `coins`', () => {
    expect(summaryCoins({ balance: { purchased: 1, bonus: 2, total: 3 } })).toBe(3)
    expect(summaryCoins({ coins: 7 })).toBe(7)
    expect(summaryCoins({})).toBeNull()
  })

  it('needs at least two characters to search', () => {
    expect(isSearchable(' a ')).toBe(false)
    expect(isSearchable('aw')).toBe(true)
  })

  it('normalises unlock methods from either case', () => {
    expect(normalizeUnlockMethod('COINS')).toBe('coins')
    expect(normalizeUnlockMethod('vip')).toBe('vip')
    expect(normalizeUnlockMethod('WHATEVER')).toBe('other')
  })

  it('paginates and sorts the ledger newest first', () => {
    const items = Array.from({ length: 45 }, (_, index) => index)
    expect(paginate(items, 1)).toHaveLength(20)
    expect(paginate(items, 3)).toEqual([40, 41, 42, 43, 44])
    expect(paginate(items, 0)).toEqual(paginate(items, 1))
    const sorted = sortLedger([
      { id: 'a', createdAt: '2026-10-01T00:00:00Z' },
      { id: 'b', createdAt: '2026-10-05T00:00:00Z' },
    ] as never)
    expect(sorted.map((entry) => entry.id)).toEqual(['b', 'a'])
  })
})

describe('users — coin adjustment preview and validation (B-09)', () => {
  it('previews the resulting balance bucket by bucket', () => {
    expect(adjustmentPreview(wallet, { direction: 'credit', amount: 50, bucket: 'BONUS' })).toEqual(
      { purchased: 180, bonus: 95, total: 275, negative: false },
    )
    expect(
      adjustmentPreview(wallet, { direction: 'debit', amount: 100, bucket: 'PURCHASED' }),
    ).toEqual({ purchased: 80, bonus: 45, total: 125, negative: false })
    expect(adjustmentPreview(wallet, { direction: 'debit', amount: 50, bucket: 'BONUS' })).toEqual({
      purchased: 180,
      bonus: -5,
      total: 175,
      negative: true,
    })
  })

  it('signs the amount from the direction', () => {
    expect(signedAmount({ direction: 'credit', amount: 10 })).toBe(10)
    expect(signedAmount({ direction: 'debit', amount: 10 })).toBe(-10)
    expect(signedAmount({ direction: 'debit', amount: -10 })).toBe(-10)
    expect(signedAmount({ direction: 'credit', amount: null })).toBe(0)
  })

  it('requires a positive integer amount and a reason of 10+ characters', () => {
    expect(validateAdjustment(emptyAdjustmentForm(), wallet)).toEqual({
      amount: 'validation.required',
      reason: 'users.validation.reasonMin',
    })
    expect(
      validateAdjustment(
        { direction: 'credit', amount: 2.5, bucket: 'BONUS', reason: 'Geste commercial' },
        wallet,
      ),
    ).toEqual({ amount: 'users.validation.amountPositive' })
    expect(
      validateAdjustment(
        { direction: 'debit', amount: 60, bucket: 'BONUS', reason: 'Trop court' },
        wallet,
      ),
    ).toEqual({ amount: 'users.validation.insufficient' })
    expect(
      validateAdjustment(
        { direction: 'debit', amount: 40, bucket: 'BONUS', reason: 'Remboursement partiel #12' },
        wallet,
      ),
    ).toEqual({})
  })

  it('builds the contract payload with the signed amount and a trimmed reason', () => {
    expect(
      adjustmentToInput({
        direction: 'debit',
        amount: 40,
        bucket: 'PURCHASED',
        reason: '  Fraude confirmée  ',
      }),
    ).toEqual({ amount: -40, bucket: 'PURCHASED', reason: 'Fraude confirmée' })
    expect(validateReason('court')).toBe('users.validation.reasonMin')
    expect(validateReason('Motif suffisamment long')).toBeUndefined()
  })

  it('maps the 4xx codes of the backend to French keys', () => {
    expect(userErrorKey(ApiError.fromBody(409, 'INSUFFICIENT_COINS', 'x'))).toBe(
      'users.errors.insufficientCoins',
    )
    expect(userErrorKey(ApiError.fromBody(409, 'USER_ALREADY_BLOCKED', 'x'))).toBe(
      'users.errors.alreadyBlocked',
    )
    expect(userErrorKey(ApiError.fromBody(404, 'USER_NOT_FOUND', 'x'))).toBe(
      'users.errors.notFound',
    )
    expect(userErrorKey(ApiError.fromBody(400, 'VALIDATION_ERROR', 'x'))).toBe(
      'users.errors.validation',
    )
    expect(userErrorKey(ApiError.fromBody(409, 'SOMETHING_ELSE', 'x'))).toBe(
      'users.errors.conflict',
    )
    expect(userErrorKey(ApiError.fromBody(500, 'INTERNAL', 'x'))).toBeNull()
    expect(userErrorKey(new Error('boom'))).toBeNull()
  })
})
