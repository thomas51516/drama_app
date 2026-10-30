import { describe, expect, it } from 'vitest'
import {
  csvField,
  dateToParam,
  formatAmounts,
  isReconciled,
  isReconciliationDate,
  mismatchReasonKey,
  paramToDate,
  reconciliationCsvFilename,
  reconciliationTiles,
  reconciliationToCsv,
} from '../utils/reconciliation'
import type { TopupReconciliation } from '../types/api'

function report(overrides: Partial<TopupReconciliation> = {}): TopupReconciliation {
  return {
    date: '2026-10-30',
    orders: 10,
    paid: 8,
    credited: 8,
    mismatches: [],
    ...overrides,
  }
}

describe('reconciliation — date handling (B-11)', () => {
  it('validates YYYY-MM-DD and rejects garbage', () => {
    expect(isReconciliationDate('2026-10-30')).toBe(true)
    expect(isReconciliationDate('2026-13-40')).toBe(false)
    expect(isReconciliationDate('30/10/2026')).toBe(false)
    expect(isReconciliationDate(null)).toBe(false)
  })

  it('round-trips a picker date and a param', () => {
    const date = new Date(2026, 9, 30) // October is month 9
    expect(dateToParam(date)).toBe('2026-10-30')
    const back = paramToDate('2026-10-30')
    expect(back?.getFullYear()).toBe(2026)
    expect(back?.getMonth()).toBe(9)
    expect(back?.getDate()).toBe(30)
    expect(paramToDate('nope')).toBeNull()
  })
})

describe('reconciliation — tiles and reconciled state', () => {
  it('derives ratios of paid/orders and credited/paid, flags mismatches', () => {
    const tiles = reconciliationTiles(report({ orders: 10, paid: 8, credited: 6 }))
    const paidTile = tiles.find((t) => t.key === 'paid')!
    const creditedTile = tiles.find((t) => t.key === 'credited')!
    expect(paidTile.ratio).toBeCloseTo(0.8)
    expect(creditedTile.ratio).toBeCloseTo(0.75)
    expect(creditedTile.severity).toBe('warn')
  })

  it('a report with no mismatch and credited == paid is reconciled', () => {
    expect(isReconciled(report({ paid: 8, credited: 8, mismatches: [] }))).toBe(true)
    expect(isReconciled(report({ paid: 8, credited: 6, mismatches: [] }))).toBe(false)
    expect(
      isReconciled(
        report({
          mismatches: [
            {
              orderId: 'o1',
              reason: 'PAID_NOT_CREDITED',
            },
          ],
        }),
      ),
    ).toBe(false)
    expect(isReconciled(null)).toBe(false)
  })

  it('maps known mismatch reasons to i18n keys, leaves unknown ones as null', () => {
    expect(mismatchReasonKey('PAID_NOT_CREDITED')).toBe('reconciliation.reasons.PAID_NOT_CREDITED')
    expect(mismatchReasonKey('SOMETHING_ELSE')).toBeNull()
  })
})

describe('reconciliation — CSV export', () => {
  it('quotes fields with commas, quotes or newlines (RFC 4180)', () => {
    expect(csvField('simple')).toBe('simple')
    expect(csvField('a,b')).toBe('"a,b"')
    expect(csvField('say "hi"')).toBe('"say ""hi"""')
    expect(csvField(null)).toBe('')
  })

  it('produces one header row plus one row per mismatch, CRLF-terminated', () => {
    const csv = reconciliationToCsv(
      report({
        mismatches: [
          {
            orderId: 'ord_1',
            userId: 'user_1',
            packSku: 'coins_300',
            status: 'PAID',
            amount: { currency: 'XOF', amountMinor: 1500 },
            coinsExpected: 330,
            coinsCredited: 0,
            reason: 'PAID_NOT_CREDITED',
            createdAt: '2026-10-30T10:00:00.000Z',
          },
        ],
      }),
    )
    const lines = csv.split('\r\n').filter(Boolean)
    expect(lines).toHaveLength(2)
    expect(lines[0]).toBe(
      'date,orderId,userId,packSku,status,providerStatus,amount,currency,coinsExpected,coinsCredited,reason,createdAt',
    )
    expect(lines[1]).toContain('ord_1')
    expect(lines[1]).toContain('PAID_NOT_CREDITED')
    expect(lines[1]).toContain('1500')
    expect(csv.endsWith('\r\n')).toBe(true)
  })

  it('names the file after the report date', () => {
    expect(reconciliationCsvFilename('2026-10-30')).toBe('reconciliation-recharges-2026-10-30.csv')
  })

  it('formats the per-currency amounts the real API reports as an array', () => {
    expect(formatAmounts([{ currency: 'XOF', amountMinor: 1700 }])).toContain('700')
    expect(formatAmounts([])).toBe('—')
    expect(formatAmounts(null)).toBe('—')
    expect(
      formatAmounts([
        { currency: 'XOF', amountMinor: 1700 },
        { currency: 'EUR', amountMinor: 1200 },
      ]),
    ).toContain('+')
  })
})
