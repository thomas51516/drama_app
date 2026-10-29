import { describe, expect, it } from 'vitest'
import {
  actionSeverity,
  changedLines,
  diffAuditValues,
  formatJson,
  formatJsonValue,
  jsonEqual,
  splitAction,
} from '../utils/audit-diff'

describe('audit diff helpers (B-13)', () => {
  it('compares JSON values structurally', () => {
    expect(jsonEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true)
    expect(jsonEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true)
    expect(jsonEqual([1, 2], [2, 1])).toBe(false)
    expect(jsonEqual(null, undefined)).toBe(false)
  })

  it('lists the union of keys with added / removed / changed / same statuses', () => {
    const lines = diffAuditValues(
      { title: 'Avant', territories: ['FR'], coinCost: 20, removedKey: true },
      { title: 'Après', territories: ['FR'], coinCost: 30, addedKey: 'x' },
    )
    expect(lines.map((line) => [line.key, line.status])).toEqual([
      ['addedKey', 'added'],
      ['coinCost', 'changed'],
      ['removedKey', 'removed'],
      ['territories', 'same'],
      ['title', 'changed'],
    ])
    expect(changedLines(lines)).toHaveLength(4)
  })

  it('handles creations, deletions, scalars and the wrapped null of the backend', () => {
    expect(diffAuditValues(null, { email: 'a@b.co', role: 'EDITOR' })).toEqual([
      { key: 'email', before: undefined, after: 'a@b.co', status: 'added' },
      { key: 'role', before: undefined, after: 'EDITOR', status: 'added' },
    ])
    expect(diffAuditValues({ title: 'Gone' }, { value: null })).toEqual([
      { key: 'title', before: 'Gone', after: undefined, status: 'removed' },
    ])
    expect(diffAuditValues('DRAFT', 'PUBLISHED')).toEqual([
      { key: '', before: 'DRAFT', after: 'PUBLISHED', status: 'changed' },
    ])
    expect(diffAuditValues(undefined, undefined)).toEqual([])
    expect(diffAuditValues(null, null)).toEqual([])
  })

  it('formats values for the cells and the raw view', () => {
    expect(formatJsonValue(undefined)).toBe('—')
    expect(formatJsonValue(null)).toBe('null')
    expect(formatJsonValue('texte')).toBe('texte')
    expect(formatJsonValue({ a: 1 })).toBe('{\n  "a": 1\n}')
    expect(formatJson({ value: null })).toBe('—')
    expect(formatJson({ a: [1] })).toContain('"a"')
  })

  it('splits actions and picks a tag severity by verb', () => {
    expect(splitAction('series.update')).toEqual({ target: 'series', verb: 'update' })
    expect(splitAction('login')).toEqual({ target: null, verb: 'login' })
    expect(actionSeverity('home_banner.create')).toBe('success')
    expect(actionSeverity('admin_account.reset_totp')).toBe('danger')
    expect(actionSeverity('episode.reorder')).toBe('info')
    expect(actionSeverity('episode.transcode_failed')).toBe('warn')
    expect(actionSeverity('something.else')).toBe('secondary')
  })
})
