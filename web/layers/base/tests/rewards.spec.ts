import { describe, expect, it } from 'vitest'
import {
  checkinTotal,
  defaultCheckinScale,
  hasCheckinErrors,
  normalizeCheckinDays,
  sameCheckinScale,
  sortTasks,
  taskLabelKey,
  taskPatch,
  taskPeriod,
  taskToForm,
  validateCheckinScale,
  validateTaskForm,
  weeklyTaskPotential,
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

describe('rewards — tasks (M-41, contract v1.5)', () => {
  const makeTask = (overrides: Partial<Parameters<typeof taskToForm>[0]> = {}) => ({
    key: 'watch_3_episodes',
    title: 'Regarder 3 épisodes',
    description: null,
    coins: 5,
    target: 3,
    isActive: true,
    period: 'DAILY' as const,
    ...overrides,
  })

  it('orders the MVP keys first, unknown keys last and alphabetical', () => {
    const tasks = [
      makeTask({ key: 'add_favorite' }),
      makeTask({ key: 'zzz_custom' }),
      makeTask({ key: 'watch_3_episodes' }),
      makeTask({ key: 'aaa_custom' }),
    ]
    expect(sortTasks(tasks).map((t) => t.key)).toEqual([
      'watch_3_episodes',
      'add_favorite',
      'aaa_custom',
      'zzz_custom',
    ])
  })

  it('resolves a French label for known keys and null for unknown ones', () => {
    expect(taskLabelKey('watch_3_episodes')).toBe('rewards.tasks.keys.watch_3_episodes')
    expect(taskLabelKey('some_custom_task')).toBeNull()
  })

  it('validates target >= 1 and coins >= 0, within their maxima', () => {
    expect(validateTaskForm({ coins: 5, target: 3, isActive: true })).toEqual({})
    expect(validateTaskForm({ coins: -1, target: 0, isActive: true })).toEqual({
      coins: 'validation.nonNegativeInteger',
      target: 'validation.positiveInteger',
    })
    expect(validateTaskForm({ coins: 5000, target: 5000, isActive: true })).toEqual({
      coins: 'validation.max',
      target: 'validation.max',
    })
  })

  it('patches only the changed fields', () => {
    const task = makeTask()
    expect(taskPatch(taskToForm(task), task)).toEqual({})
    expect(taskPatch({ coins: 10, target: 3, isActive: true }, task)).toEqual({ coins: 10 })
    expect(taskPatch({ coins: 5, target: 3, isActive: false }, task)).toEqual({ isActive: false })
  })

  it('sums a weekly potential: daily tasks count 7x, others once, inactive tasks excluded', () => {
    const tasks = [
      makeTask({ key: 'watch_3_episodes', coins: 5, period: 'DAILY', isActive: true }),
      makeTask({ key: 'watch_10_episodes', coins: 20, period: 'WEEKLY', isActive: true }),
      makeTask({ key: 'share_series', coins: 10, period: 'ONCE', isActive: true }),
      makeTask({ key: 'add_favorite', coins: 1000, period: 'ONCE', isActive: false }),
    ]
    expect(weeklyTaskPotential(tasks)).toBe(5 * 7 + 20 + 10)
  })

  it('infers the period of the fixed MVP keys when the backend omits it', () => {
    expect(taskPeriod({ key: 'watch_3_episodes' })).toBe('DAILY')
    expect(taskPeriod({ key: 'watch_10_episodes' })).toBe('WEEKLY')
    expect(taskPeriod({ key: 'share_series' })).toBe('ONCE')
    expect(taskPeriod({ key: 'watch_3_episodes', period: 'WEEKLY' })).toBe('WEEKLY')
  })
})
