import type { CheckinScale } from '../types/api'
import { CHECKIN_DAYS } from '../types/api'

/**
 * Pure helpers of the rewards module (B-08, contract v1.4): the 7-day check-in scale (M-40).
 * Error codes are i18n keys.
 */

export const CHECKIN_DAY_MAX = 1000

/** Default scale proposed when the API has none: small daily amounts, a bigger day 7. */
export function defaultCheckinScale(): CheckinScale {
  return { days: [5, 5, 10, 10, 15, 15, 30], resetOnMiss: true }
}

/** Coins earned over a full 7-day streak. */
export function checkinTotal(days: readonly (number | null | undefined)[]): number {
  return days.reduce<number>(
    (sum, value) => sum + (typeof value === 'number' && Number.isFinite(value) ? value : 0),
    0,
  )
}

/** Normalise an API or form value into exactly `CHECKIN_DAYS` entries (missing → 0). */
export function normalizeCheckinDays(days: readonly unknown[] | null | undefined): number[] {
  return Array.from({ length: CHECKIN_DAYS }, (_, index) => {
    const value = days?.[index]
    return typeof value === 'number' && Number.isFinite(value) ? value : 0
  })
}

export interface CheckinErrors {
  /** Index → error key for the days in error. */
  days: Record<number, string>
  /** Error on the scale as a whole. */
  scale?: string
}

export function validateCheckinScale(scale: {
  days: readonly (number | null)[]
  resetOnMiss: boolean
}): CheckinErrors {
  const errors: CheckinErrors = { days: {} }
  if (scale.days.length !== CHECKIN_DAYS) errors.scale = 'rewards.validation.sevenDays'
  scale.days.forEach((value, index) => {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
      errors.days[index] = 'validation.nonNegativeInteger'
    } else if (value > CHECKIN_DAY_MAX) {
      errors.days[index] = 'validation.max'
    }
  })
  if (!errors.scale && checkinTotal(scale.days) === 0) errors.scale = 'rewards.validation.allZero'
  return errors
}

export function hasCheckinErrors(errors: CheckinErrors): boolean {
  return Boolean(errors.scale) || Object.keys(errors.days).length > 0
}

export function sameCheckinScale(a: CheckinScale, b: CheckinScale): boolean {
  return (
    a.resetOnMiss === b.resetOnMiss &&
    a.days.length === b.days.length &&
    a.days.every((value, index) => value === b.days[index])
  )
}
