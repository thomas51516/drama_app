import { describe, expect, it } from 'vitest'
import { ApiError } from '../utils/api-error'
import { isCompleteTotpCode, loginErrorKey } from '../utils/auth-errors'

/** DEF-005: clear French messages on the login page, whatever the backend answers. */
describe('login error mapping (DEF-005)', () => {
  it('accepts exactly six digits', () => {
    expect(isCompleteTotpCode('123456')).toBe(true)
    expect(isCompleteTotpCode('12345')).toBe(false)
    expect(isCompleteTotpCode('1234567')).toBe(false)
    expect(isCompleteTotpCode('12a456')).toBe(false)
  })

  it('maps the TOTP step: wrong code, incomplete code, expired challenge', () => {
    expect(loginErrorKey(ApiError.fromBody(401, 'INVALID_TOTP_CODE', 'bad'), 'totp')).toBe(
      'auth.errors.invalidTotp',
    )
    expect(loginErrorKey(ApiError.fromBody(400, 'VALIDATION_ERROR', 'code'), 'totp')).toBe(
      'auth.errors.totpIncomplete',
    )
    expect(loginErrorKey(ApiError.fromBody(401, 'CHALLENGE_EXPIRED', 'exp'), 'totp')).toBe(
      'auth.errors.challengeExpired',
    )
    expect(loginErrorKey(ApiError.fromBody(429, 'TOO_MANY_ATTEMPTS', 'slow'), 'totp')).toBe(
      'auth.errors.tooManyAttempts',
    )
  })

  it('maps the credentials step: 401 and 400 are both « Identifiants incorrects »', () => {
    expect(loginErrorKey(ApiError.fromBody(401, 'INVALID_CREDENTIALS', 'x'), 'credentials')).toBe(
      'auth.errors.invalidCredentials',
    )
    expect(loginErrorKey(ApiError.fromBody(400, 'VALIDATION_ERROR', 'x'), 'credentials')).toBe(
      'auth.errors.invalidCredentials',
    )
    expect(loginErrorKey(ApiError.fromBody(401, 'ACCOUNT_DISABLED', 'x'), 'credentials')).toBe(
      'auth.errors.accountDisabled',
    )
    expect(loginErrorKey(new ApiError(0, 'offline'), 'credentials')).toBe('auth.errors.network')
    expect(loginErrorKey(new ApiError(503, 'down'), 'credentials')).toBe('auth.errors.generic')
    expect(loginErrorKey(new Error('?'), 'totp')).toBe('auth.errors.generic')
  })
})
