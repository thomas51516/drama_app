/**
 * Rendering helpers of the audit log (B-13): side-by-side diff of `oldValue` / `newValue`.
 * The backend stores only the changed fields (see `diffChanges` in backend audit.service.ts),
 * but a full snapshot (create/delete) is handled too: unchanged keys are flagged `same`.
 */

export type DiffStatus = 'added' | 'removed' | 'changed' | 'same'

export interface DiffLine {
  key: string
  before: unknown
  after: unknown
  status: DiffStatus
}

/** Target types known to the back-office (filter suggestions; any value is accepted). */
export const AUDIT_TARGET_TYPES = [
  'series',
  'episode',
  'subtitle',
  'home_banner',
  'home_row',
  'admin_account',
  'upload',
  'monetization_settings',
  'coin_pack',
  'vip_plan',
  'checkin_scale',
  'user',
] as const

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Structural equality on JSON values (key order of objects ignored). */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => jsonEqual(item, b[index]))
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)])
    for (const key of keys) {
      if (!jsonEqual(a[key], b[key])) return false
    }
    return true
  }
  return false
}

/** Backend wraps a literal `null` as `{ value: null }` to tell it apart from "absent". */
function unwrap(value: unknown): unknown {
  if (
    isPlainObject(value) &&
    Object.keys(value).length === 1 &&
    'value' in value &&
    value.value === null
  ) {
    return null
  }
  return value
}

/**
 * One line per key of the union of both objects. Scalars / arrays at the root yield a single
 * line with an empty key. `undefined` on one side means the key is absent there; a root `null`
 * (creation / deletion) counts as absent too.
 */
export function diffAuditValues(oldValue: unknown, newValue: unknown): DiffLine[] {
  const before = unwrap(oldValue)
  const after = unwrap(newValue)
  if (before == null && after == null) return []
  if (!isPlainObject(before) || !isPlainObject(after)) {
    // A creation or deletion: the other side is absent (undefined or null).
    if (isPlainObject(before) && after == null) {
      return Object.keys(before).map((key) => ({
        key,
        before: before[key],
        after: undefined,
        status: 'removed',
      }))
    }
    if (isPlainObject(after) && before == null) {
      return Object.keys(after).map((key) => ({
        key,
        before: undefined,
        after: after[key],
        status: 'added',
      }))
    }
    return [{ key: '', before, after, status: statusOf(before, after) }]
  }
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).sort()
  return keys.map((key) => ({
    key,
    before: before[key],
    after: after[key],
    status: statusOf(before[key], after[key]),
  }))
}

function statusOf(before: unknown, after: unknown): DiffStatus {
  if (before === undefined && after !== undefined) return 'added'
  if (before !== undefined && after === undefined) return 'removed'
  return jsonEqual(before, after) ? 'same' : 'changed'
}

export function changedLines(lines: readonly DiffLine[]): DiffLine[] {
  return lines.filter((line) => line.status !== 'same')
}

/** Pretty JSON for the diff cells; `undefined` renders as an em dash (absent). */
export function formatJsonValue(value: unknown): string {
  if (value === undefined) return '—'
  if (value === null) return 'null'
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export function formatJson(value: unknown): string {
  const unwrapped = unwrap(value)
  if (unwrapped === undefined || unwrapped === null) return '—'
  try {
    return JSON.stringify(unwrapped, null, 2)
  } catch {
    return String(value)
  }
}

/** `series.update` → `{ target: 'series', verb: 'update' }`; keeps the whole string as verb otherwise. */
export function splitAction(action: string): { target: string | null; verb: string } {
  const index = action.indexOf('.')
  if (index === -1) return { target: null, verb: action }
  return { target: action.slice(0, index), verb: action.slice(index + 1) }
}

export type ActionSeverity = 'success' | 'info' | 'warn' | 'danger' | 'secondary'

/** Tag colour of an action by its verb. */
export function actionSeverity(action: string): ActionSeverity {
  const { verb } = splitAction(action)
  if (/^(create|publish|login|upload|enrol)/.test(verb)) return 'success'
  if (/^(delete|archive|deactivate|reset)/.test(verb)) return 'danger'
  if (/^(update|reorder|rename|replace|retranscode)/.test(verb)) return 'info'
  if (/fail|denied/.test(verb)) return 'warn'
  return 'secondary'
}
