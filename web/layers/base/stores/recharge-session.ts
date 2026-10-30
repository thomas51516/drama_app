import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useApi } from '../composables/useApi'
import type { AppUser, OtpRequestResponse, PublicAuthSession } from '../types/api'

export const USER_TOKEN_COOKIE = 'drama_user_token'
export const USER_REFRESH_COOKIE = 'drama_user_refresh'
export const USER_DEVICE_COOKIE = 'drama_device'

const THIRTY_DAYS = 30 * 24 * 60 * 60
const ONE_YEAR = 365 * 24 * 60 * 60

/**
 * `POST /auth/refresh` is documented as `AuthResponseDto { user, tokens }` in openapi.v1.json
 * while the sign-in routes answer `AuthSessionDto` (flat). Both are accepted.
 */
type RefreshResponse =
  | PublicAuthSession
  | {
      user: Partial<AppUser> & { id: string }
      tokens: { accessToken: string; refreshToken: string; accessTokenExpiresIn?: number }
    }

function normalizeSession(raw: RefreshResponse, previous: AppUser | null): PublicAuthSession {
  if ('tokens' in raw) {
    return {
      accessToken: raw.tokens.accessToken,
      refreshToken: raw.tokens.refreshToken,
      expiresIn: raw.tokens.accessTokenExpiresIn ?? 900,
      user: { ...(previous ?? ({} as AppUser)), ...(raw.user as AppUser) },
      linked: false,
    }
  }
  return raw
}

function randomDeviceId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `web-${crypto.randomUUID()}`
  return `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

/**
 * End-user session of the recharge site: the same account as the Android app, through the
 * public `/auth/*` routes (OTP, e-mail + password, Google).
 *
 * Storage trade-off (same as the admin JWT, see `stores/auth.ts`): the site must send
 * `Authorization: Bearer`, so the tokens live in non-httpOnly cookies rather than localStorage.
 * They are `SameSite=Lax` (not Strict) on purpose: the user comes back from the payment
 * provider through a cross-site top-level navigation and the session must survive it.
 * The refresh token is rotated on every `/auth/refresh` (a reused token kills the session
 * server-side), kept 30 days, and revoked by `logout()`. Residual risk: XSS, mitigated by the
 * CSP and the short access-token lifetime.
 */
export const useRechargeSession = defineStore('rechargeSession', () => {
  const cookieOptions = {
    sameSite: 'lax' as const,
    secure: !import.meta.dev,
    path: '/',
    maxAge: THIRTY_DAYS,
    default: () => null,
  }
  const token = useCookie<string | null>(USER_TOKEN_COOKIE, cookieOptions)
  const refreshToken = useCookie<string | null>(USER_REFRESH_COOKIE, cookieOptions)
  const deviceId = useCookie<string | null>(USER_DEVICE_COOKIE, {
    ...cookieOptions,
    maxAge: ONE_YEAR,
  })

  const user = ref<AppUser | null>(null)
  const pending = ref(false)
  /** Single-flight refresh shared by concurrent 401s. */
  let refreshing: Promise<boolean> | null = null

  const isAuthenticated = computed(() => Boolean(token.value))

  /** Stable per-browser installation id (M-50), created on first use. */
  function ensureDeviceId(): string {
    if (!deviceId.value) deviceId.value = randomDeviceId()
    return deviceId.value
  }

  function openSession(session: PublicAuthSession): AppUser {
    token.value = session.accessToken
    refreshToken.value = session.refreshToken
    user.value = session.user
    return session.user
  }

  function clearSession(): void {
    token.value = null
    refreshToken.value = null
    user.value = null
  }

  async function run<T>(task: () => Promise<T>): Promise<T> {
    pending.value = true
    try {
      return await task()
    } finally {
      pending.value = false
    }
  }

  // --- sign-in flows ---------------------------------------------------------------------

  function requestOtp(phone: string): Promise<OtpRequestResponse> {
    return run(() => useApi().post<OtpRequestResponse>('/auth/otp/request', { phone }))
  }

  function verifyOtp(requestId: string, code: string): Promise<AppUser> {
    return run(async () =>
      openSession(
        await useApi().post<PublicAuthSession>('/auth/otp/verify', {
          requestId,
          code,
          deviceId: ensureDeviceId(),
        }),
      ),
    )
  }

  function loginEmail(email: string, password: string): Promise<AppUser> {
    return run(async () =>
      openSession(
        await useApi().post<PublicAuthSession>('/auth/email/login', {
          email: email.trim(),
          password,
          deviceId: ensureDeviceId(),
        }),
      ),
    )
  }

  function registerEmail(email: string, password: string): Promise<AppUser> {
    return run(async () =>
      openSession(
        await useApi().post<PublicAuthSession>('/auth/email/register', {
          email: email.trim(),
          password,
          deviceId: ensureDeviceId(),
        }),
      ),
    )
  }

  function loginGoogle(idToken: string): Promise<AppUser> {
    return run(async () =>
      openSession(
        await useApi().post<PublicAuthSession>('/auth/google', {
          idToken,
          deviceId: ensureDeviceId(),
        }),
      ),
    )
  }

  // --- session upkeep --------------------------------------------------------------------

  /** Rotate the tokens with `POST /auth/refresh`; false when the refresh token is gone. */
  function refresh(): Promise<boolean> {
    if (refreshing) return refreshing
    const current = refreshToken.value
    if (!current) return Promise.resolve(false)
    refreshing = (async () => {
      try {
        const raw = await useApi().post<RefreshResponse>('/auth/refresh', {
          refreshToken: current,
        })
        openSession(normalizeSession(raw, user.value))
        return true
      } catch {
        clearSession()
        return false
      } finally {
        refreshing = null
      }
    })()
    return refreshing
  }

  /** Restore the profile from the cookies (page load / SSR). Clears the session on failure. */
  async function fetchMe(): Promise<AppUser | null> {
    if (!token.value) return null
    try {
      user.value = await useApi().get<AppUser>('/me')
      return user.value
    } catch {
      // A 401 already went through `tryRefresh()`; anything else leaves the user signed out.
      if (!token.value) return null
      clearSession()
      return null
    }
  }

  async function logout(): Promise<void> {
    const current = refreshToken.value
    if (current) {
      try {
        await useApi().post('/auth/logout', { refreshToken: current })
      } catch {
        // Best effort: the local session is cleared regardless.
      }
    }
    clearSession()
  }

  return {
    token,
    refreshToken,
    deviceId,
    user,
    pending,
    isAuthenticated,
    ensureDeviceId,
    requestOtp,
    verifyOtp,
    loginEmail,
    registerEmail,
    loginGoogle,
    refresh,
    fetchMe,
    logout,
    clearSession,
  }
})
