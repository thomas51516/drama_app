import type { AdminAccount, AdminAccountUpdateInput, AdminRole, AdminUser } from '../types/api'
import { ADMIN_ROLES } from '../types/api'

/**
 * Pure helpers of the internal accounts module (B-13): form validation, password generation
 * and the self-lockout guard (an admin can neither deactivate itself nor drop its ADMIN role).
 */

export const PASSWORD_MIN_LENGTH = 12
export const DISPLAY_NAME_MAX = 80
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface AccountFormValues {
  email: string
  displayName: string
  role: AdminRole
  password: string
}

export type AccountFormErrors = Partial<Record<keyof AccountFormValues, string>>

export function emptyAccountForm(): AccountFormValues {
  return { email: '', displayName: '', role: 'EDITOR', password: '' }
}

/** Problems of a password against the back-office policy (§12): length and three classes. */
export function passwordProblems(password: string): string[] {
  const problems: string[] = []
  if (password.length < PASSWORD_MIN_LENGTH) problems.push('validation.passwordLength')
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password)) problems.push('validation.passwordCase')
  if (!/\d/.test(password)) problems.push('validation.passwordDigit')
  return problems
}

export function validateAccountForm(values: AccountFormValues): AccountFormErrors {
  const errors: AccountFormErrors = {}
  const email = values.email.trim()
  if (!email) errors.email = 'validation.required'
  else if (!EMAIL_RE.test(email)) errors.email = 'validation.email'
  const name = values.displayName.trim()
  if (!name) errors.displayName = 'validation.required'
  else if (name.length > DISPLAY_NAME_MAX) errors.displayName = 'validation.maxLength'
  if (!ADMIN_ROLES.includes(values.role)) errors.role = 'validation.unknownValue'
  const problem = passwordProblems(values.password)[0]
  if (problem) errors.password = problem
  return errors
}

const LOWER = 'abcdefghijkmnopqrstuvwxyz'
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const DIGITS = '23456789'
const SYMBOLS = '!#%+-=?@'

function randomInts(count: number, max: number): number[] {
  const values = new Uint32Array(count)
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    crypto.getRandomValues(values)
  } else {
    for (let i = 0; i < count; i += 1) values[i] = Math.floor(Math.random() * 0xffffffff)
  }
  return Array.from(values, (value) => value % max)
}

/** Random password satisfying `passwordProblems()` (ambiguous glyphs excluded). */
export function generatePassword(length = 16): string {
  const size = Math.max(PASSWORD_MIN_LENGTH, length)
  const all = LOWER + UPPER + DIGITS + SYMBOLS
  const required = [LOWER, UPPER, DIGITS, SYMBOLS].map(
    (set) => set[randomInts(1, set.length)[0] as number] as string,
  )
  const rest = randomInts(size - required.length, all.length).map((i) => all[i] as string)
  const chars = [...required, ...rest]
  // Fisher–Yates so the required classes are not always at the front.
  const swaps = randomInts(chars.length, chars.length)
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = (swaps[i] as number) % (i + 1)
    ;[chars[i], chars[j]] = [chars[j] as string, chars[i] as string]
  }
  return chars.join('')
}

export type SelfLockoutReason = 'selfDeactivate' | 'selfDemote'

/**
 * Guard against locking oneself out: the current user cannot deactivate its own account nor
 * remove its own ADMIN role. Returns the reason, or null when the change is allowed.
 */
export function selfLockoutReason(
  current: Pick<AdminUser, 'id'> | null | undefined,
  target: Pick<AdminAccount, 'id' | 'role'>,
  patch: AdminAccountUpdateInput,
): SelfLockoutReason | null {
  if (!current || current.id !== target.id) return null
  if (patch.isActive === false) return 'selfDeactivate'
  if (patch.role !== undefined && patch.role !== 'ADMIN' && target.role === 'ADMIN') {
    return 'selfDemote'
  }
  return null
}

export function isSelf(
  current: Pick<AdminUser, 'id'> | null | undefined,
  account: Pick<AdminAccount, 'id'>,
): boolean {
  return Boolean(current && current.id === account.id)
}

/** Only the changed fields of the edit dialog (PATCH semantics). */
export function accountPatch(
  account: AdminAccount,
  values: { displayName: string; role: AdminRole; isActive: boolean },
): AdminAccountUpdateInput {
  const patch: AdminAccountUpdateInput = {}
  const displayName = values.displayName.trim()
  if (displayName && displayName !== account.displayName) patch.displayName = displayName
  if (values.role !== account.role) patch.role = values.role
  if (values.isActive !== account.isActive) patch.isActive = values.isActive
  return patch
}
