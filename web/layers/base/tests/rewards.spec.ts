import { describe, expect, it } from 'vitest'
import {
  checkinTotal,
  defaultCheckinScale,
  hasCheckinErrors,
  normalizeCheckinDays,
  sameCheckinScale,
  validateCheckinScale,
} from '../utils/rewards'

describe('rewards — check-in scale (B-08)', () => {
  it('sums the 7 days and ignores empty cells', () => {
    expect(checkinTotal([5, 5, 10, 10, 15, 15, 30])).toBe(90)
    expect(checkinTotal([5, null, undefined, 10, Number.NaN, 0, 30])).toBe(45)
    expect(checkinTotal(defaultCheckinScale().days)).toBe(90)
  })

  it('normalises any list to exactly 7 integers', () => {
    expect(normalizeCheckinDays([1, 2, 3])).toEqual([1, 2, 3, 0, 0, 0, 0])
    expect(normalizeCheckinDays([1, 2, 3, 4, 5, 6, 7, 8])).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(normalizeCheckinDays(null)).toEqual([0, 0, 0, 0, 0, 0, 0])
  })

  it('refuses negative, fractional or oversized days, and an all-zero scale', () => {
    const ok = validateCheckinScale({ days: [5, 5, 10, 10, 15, 15, 30], resetOnMiss: true })
    expect(hasCheckinErrors(ok)).toBe(false)

    const bad = validateCheckinScale({ days: [-1, 2.5, 10, 10, 15, 15, 5000], resetOnMiss: true })
    expect(bad.days).toEqual({
      0: 'validation.nonNegativeInteger',
      1: 'validation.nonNegativeInteger',
      6: 'validation.max',
    })

    const zero = validateCheckinScale({ days: [0, 0, 0, 0, 0, 0, 0], resetOnMiss: false })
    expect(zero.scale).toBe('rewards.validation.allZero')
    expect(hasCheckinErrors(zero)).toBe(true)

    const short = validateCheckinScale({ days: [1, 2], resetOnMiss: false })
    expect(short.scale).toBe('rewards.validation.sevenDays')
  })

  it('compares scales value by value', () => {
    const a = defaultCheckinScale()
    expect(sameCheckinScale(a, defaultCheckinScale())).toBe(true)
    expect(sameCheckinScale(a, { ...a, resetOnMiss: false })).toBe(false)
    expect(sameCheckinScale(a, { ...a, days: [...a.days.slice(0, 6), 31] })).toBe(false)
  })
})
