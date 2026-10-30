import { ApiError } from './api-error'

/**
 * i18n key of the message shown on the login page for a failed step (DEF-005).
 *
 * - credentials: 401 (and the 400 of a password shorter than the backend minimum) →
 *   « Identifiants incorrects » ; 429 → « Trop de tentatives ».
 * - totp: `INVALID_TOTP_CODE` (401) → « Code incorrect ou expiré » ; a 400 `VALIDATION_ERROR`
 *   (incomplete code) → « Saisissez les 6 chiffres » ; expired challenge → « Session de
 *   connexion expirée ».
 */
export type LoginStep = 'credentials' | 'totp'

export function loginErrorKey(error: unknown, step: LoginStep): string {
  if (!ApiError.is(error)) return 'auth.errors.generic'
  if (error.status === 0) return 'auth.errors.network'
  if (error.status === 429) return 'auth.errors.tooManyAttempts'
  if (step === 'credentials') {
    if (error.code === 'ACCOUNT_DISABLED') return 'auth.errors.accountDisabled'
    if (error.status === 401 || error.status === 400) return 'auth.errors.invalidCredentials'
    return 'auth.errors.generic'
  }
  if (error.code === 'INVALID_TOTP_CODE' || error.code === 'INVALID_TOTP') {
    return 'auth.errors.invalidTotp'
  }
  if (error.code === 'CHALLENGE_EXPIRED' || error.code === 'INVALID_CHALLENGE') {
    return 'auth.errors.challengeExpired'
  }
  if (error.status === 400) return 'auth.errors.totpIncomplete'
  if (error.status === 401) return 'auth.errors.invalidTotp'
  return 'auth.errors.generic'
}

/** Exactly six digits (the backend validates the same). */
export const TOTP_CODE_RE = /^\d{6}$/

export function isCompleteTotpCode(code: string): boolean {
  return TOTP_CODE_RE.test(code)
}
