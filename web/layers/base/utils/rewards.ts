import type { CheckinScale, RewardTaskAdmin, RewardTaskInput, RewardTaskPeriod } from '../types/api'
import { CHECKIN_DAYS, REWARD_TASK_KEYS } from '../types/api'

/**
 * Pure helpers of the rewards module (B-08): the 7-day check-in scale (M-40, contract v1.4)
 * and the reward tasks (M-41, contract v1.5). Error codes are i18n keys.
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

// ---------------------------------------------------------------------------
// Reward tasks (M-41, contract v1.5) — B-08 « Tâches »
// ---------------------------------------------------------------------------

export const TASK_COINS_MAX = 1000
export const TASK_TARGET_MAX = 1000

/** Display order of the fixed MVP keys; unknown keys (added by the backend) go last. */
export function sortTasks(tasks: readonly RewardTaskAdmin[]): RewardTaskAdmin[] {
  const rank = (key: string): number => {
    const index = (REWARD_TASK_KEYS as readonly string[]).indexOf(key)
    return index === -1 ? REWARD_TASK_KEYS.length : index
  }
  return [...tasks].sort((a, b) => rank(a.key) - rank(b.key) || a.key.localeCompare(b.key))
}

/** i18n key of the French label of a known task (`rewards.tasks.keys.<key>`), or null. */
export function taskLabelKey(key: string): string | null {
  return (REWARD_TASK_KEYS as readonly string[]).includes(key) ? `rewards.tasks.keys.${key}` : null
}

/** Period of a task when the backend does not send it: inferred from the MVP keys. */
export function taskPeriod(task: Pick<RewardTaskAdmin, 'key' | 'period'>): RewardTaskPeriod {
  if (task.period) return task.period
  if (task.key === 'watch_3_episodes') return 'DAILY'
  if (task.key === 'watch_10_episodes') return 'WEEKLY'
  return 'ONCE'
}

export interface TaskFormValues {
  coins: number | null
  target: number | null
  isActive: boolean
}

export type TaskFormErrors = Partial<Record<'coins' | 'target', string>>

export function taskToForm(task: RewardTaskAdmin): TaskFormValues {
  return { coins: task.coins, target: task.target, isActive: task.isActive }
}

export function validateTaskForm(values: TaskFormValues): TaskFormErrors {
  const errors: TaskFormErrors = {}
  if (typeof values.coins !== 'number' || !Number.isInteger(values.coins) || values.coins < 0) {
    errors.coins = 'validation.nonNegativeInteger'
  } else if (values.coins > TASK_COINS_MAX) {
    errors.coins = 'validation.max'
  }
  if (typeof values.target !== 'number' || !Number.isInteger(values.target) || values.target < 1) {
    errors.target = 'validation.positiveInteger'
  } else if (values.target > TASK_TARGET_MAX) {
    errors.target = 'validation.max'
  }
  return errors
}

/** Only the changed fields go into the PATCH (empty object = nothing to save). */
export function taskPatch(values: TaskFormValues, task: RewardTaskAdmin): RewardTaskInput {
  const patch: RewardTaskInput = {}
  if (values.coins !== null && values.coins !== task.coins) patch.coins = values.coins
  if (values.target !== null && values.target !== task.target) patch.target = values.target
  if (values.isActive !== task.isActive) patch.isActive = values.isActive
  return patch
}

/** Coins a diligent user can earn per week from the active tasks (daily ×7, weekly ×1, once ×1). */
export function weeklyTaskPotential(tasks: readonly RewardTaskAdmin[]): number {
  return tasks
    .filter((task) => task.isActive)
    .reduce((sum, task) => {
      const period = taskPeriod(task)
      return sum + task.coins * (period === 'DAILY' ? 7 : 1)
    }, 0)
}
