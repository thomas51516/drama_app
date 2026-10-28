import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useApi } from '../composables/useApi'
import type { AdminUser, LoginResponse, TotpVerifyResponse } from '../types/api'

export const AUTH_COOKIE_NAME = 'drama_admin_token'

export type AuthStep = 'credentials' | 'totp' | 'totp_setup'

/**
 * Admin session.
 *
 * Token storage trade-off: the SPA needs the JWT to set the Authorization header, so the
 * cookie cannot be httpOnly. We keep it in a `SameSite=Strict`, `Secure` (outside dev) cookie
 * with a short max-age rather than localStorage: it is never sent cross-site and not readable
 * from other origins. XSS remains the residual risk, mitigated by the CSP and the short JWT
 * lifetime decided with the backend (S03-BE-04). Revisit if the backend adds a cookie session.
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

  const user = ref<AdminUser | null>(null)
  const step = ref<AuthStep>('credentials')
  const challengeToken = ref<string | null>(null)
  const totpSetup = ref<{ otpauthUri: string; secret: string } | null>(null)
  const pending = ref(false)

  const isAuthenticated = computed(() => Boolean(token.value))

  function resetChallenge(): void {
    step.value = 'credentials'
    challengeToken.value = null
    totpSetup.value = null
  }

  /** Step 1: email + password. Never yields a session, only a TOTP challenge. */
  async function login(email: string, password: string): Promise<AuthStep> {
    const api = useApi()
    pending.value = true
    try {
      const response = await api.post<LoginResponse>('/admin/auth/login', { email, password })
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

  /** Step 2: 6-digit TOTP code. On success the JWT is stored in the cookie. */
  async function verifyTotp(code: string): Promise<AdminUser> {
    if (!challengeToken.value) {
      throw new Error('No pending login challenge')
    }
    const api = useApi()
    pending.value = true
    try {
      const response = await api.post<TotpVerifyResponse>('/admin/auth/totp/verify', {
        challengeToken: challengeToken.value,
        code,
      })
      token.value = response.accessToken
      user.value = response.user
      resetChallenge()
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

  /** Forget the session locally (used by logout and by the API client on 401). */
  function clearSession(): void {
    token.value = null
    user.value = null
    resetChallenge()
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
    user,
    step,
    challengeToken,
    totpSetup,
    pending,
    isAuthenticated,
    login,
    verifyTotp,
    fetchMe,
    logout,
    clearSession,
    resetChallenge,
  }
})
