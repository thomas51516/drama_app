import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useApi } from '../composables/useApi'
import type { AdminUser, LoginResponse, TotpVerifyResponse } from '../types/api'
import { TRUSTED_DEVICE_MAX_AGE_SECONDS } from '../types/api'

export const AUTH_COOKIE_NAME = 'drama_admin_token'
/** Trusted-device token (contract v1.3): 30 days, kept across logouts (logout is not revocation). */
export const DEVICE_COOKIE_NAME = 'drama_admin_device'

/** `done` is returned by `login()` when a trusted device opened the session without a code. */
export type AuthStep = 'credentials' | 'totp' | 'totp_setup' | 'done'

/**
 * Admin session.
 *
 * Token storage trade-off: the SPA needs the JWT to set the Authorization header, so the
 * cookie cannot be httpOnly. We keep it in a `SameSite=Strict`, `Secure` (outside dev) cookie
 * with a short max-age rather than localStorage: it is never sent cross-site and not readable
 * from other origins. XSS remains the residual risk, mitigated by the CSP and the short JWT
 * lifetime decided with the backend (S03-BE-04). Revisit if the backend adds a cookie session.
 *
 * The trusted-device token (B-13+) follows the same rules with a 30-day max-age. It only lets
 * the server skip the TOTP step for this account; it is hashed server-side and revocable from
 * « Mon compte ». It is never cleared by a logout or a 401, only by `forgetDevice()`.
 */
export const useAuthStore = defineStore('auth', () => {
  /** The JWT, backed by the cookie. Writable so the API client / tests can reset it. */
  const token = useCookie<string | null>(AUTH_COOKIE_NAME, {
    sameSite: 'strict',
    secure: !import.meta.dev,
    path: '/',
    maxAge: 60 * 60 * 8,
    default: () => null,
  })

  const deviceToken = useCookie<string | null>(DEVICE_COOKIE_NAME, {
    sameSite: 'strict',
    secure: !import.meta.dev,
    path: '/',
    maxAge: TRUSTED_DEVICE_MAX_AGE_SECONDS,
    default: () => null,
  })

  const user = ref<AdminUser | null>(null)
  const step = ref<AuthStep>('credentials')
  const challengeToken = ref<string | null>(null)
  const totpSetup = ref<{ otpauthUri: string; secret: string } | null>(null)
  const pending = ref(false)

  const isAuthenticated = computed(() => Boolean(token.value))
  /** True when this browser holds a trusted-device token (not necessarily still valid). */
  const hasTrustedDevice = computed(() => Boolean(deviceToken.value))

  function resetChallenge(): void {
    step.value = 'credentials'
    challengeToken.value = null
    totpSetup.value = null
  }

  function openSession(response: { accessToken: string; user: AdminUser }): void {
    token.value = response.accessToken
    user.value = response.user
    resetChallenge()
  }

  /**
   * Step 1: email + password (+ the trusted-device token when the browser has one).
   * Yields a TOTP challenge, or `done` when the server accepted the device token.
   */
  async function login(email: string, password: string): Promise<AuthStep> {
    const api = useApi()
    pending.value = true
    try {
      const response = await api.post<LoginResponse>('/admin/auth/login', {
        email,
        password,
        ...(deviceToken.value ? { deviceToken: deviceToken.value } : {}),
      })
      if (response.status === 'ok') {
        openSession(response)
        return 'done'
      }
      challengeToken.value = response.challengeToken
      if (response.status === 'totp_setup_required') {
        totpSetup.value = { otpauthUri: response.otpauthUri, secret: response.secret }
        step.value = 'totp_setup'
      } else {
        totpSetup.value = null
        step.value = 'totp'
      }
      return step.value
    } finally {
      pending.value = false
    }
  }

  /**
   * Step 2: 6-digit TOTP code. On success the JWT is stored in the cookie; with
   * `rememberDevice` the returned device token is stored for 30 days.
   */
  async function verifyTotp(code: string, rememberDevice = false): Promise<AdminUser> {
    if (!challengeToken.value) {
      throw new Error('No pending login challenge')
    }
    const api = useApi()
    pending.value = true
    try {
      const response = await api.post<TotpVerifyResponse>('/admin/auth/totp/verify', {
        challengeToken: challengeToken.value,
        code,
        rememberDevice,
      })
      if (rememberDevice && response.deviceToken) {
        deviceToken.value = response.deviceToken
      }
      openSession(response)
      return response.user
    } finally {
      pending.value = false
    }
  }

  /** Restore the user profile from the token (page refresh). Clears the session on failure. */
  async function fetchMe(): Promise<AdminUser | null> {
    if (!token.value) return null
    const api = useApi()
    try {
      user.value = await api.get<AdminUser>('/admin/auth/me')
      return user.value
    } catch {
      clearSession()
      return null
    }
  }

  /**
   * Forget the session locally (used by logout and by the API client on 401, including
   * `ADMIN_TOKEN_REVOKED`). The trusted-device cookie is deliberately kept.
   */
  function clearSession(): void {
    token.value = null
    user.value = null
    resetChallenge()
  }

  /** Drop the trusted-device cookie of this browser (after revoking it server-side). */
  function forgetDevice(): void {
    deviceToken.value = null
  }

  async function logout(): Promise<void> {
    const api = useApi()
    if (token.value) {
      try {
        await api.post('/admin/auth/logout')
      } catch {
        // Best effort: the local session is cleared regardless.
      }
    }
    clearSession()
  }

  return {
    token,
    deviceToken,
    user,
    step,
    challengeToken,
    totpSetup,
    pending,
    isAuthenticated,
    hasTrustedDevice,
    login,
    verifyTotp,
    fetchMe,
    logout,
    clearSession,
    forgetDevice,
    resetChallenge,
  }
})
