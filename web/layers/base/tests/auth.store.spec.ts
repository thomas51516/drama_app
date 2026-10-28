import { beforeEach, describe, expect, it } from 'vitest'
import { useAuthStore, AUTH_COOKIE_NAME } from '../stores/auth'
import { mockCredentials } from '../mocks'
import { ApiError } from '../utils/api-error'

describe('auth store (mock API)', () => {
  beforeEach(() => {
    useAuthStore().clearSession()
  })

  it('starts without a session', () => {
    const auth = useAuthStore()
    expect(auth.isAuthenticated).toBe(false)
    expect(auth.user).toBeNull()
    expect(auth.step).toBe('credentials')
  })

  it('login() never opens a session: it moves to the TOTP step', async () => {
    const auth = useAuthStore()
    const step = await auth.login(mockCredentials.email, mockCredentials.password)
    expect(step).toBe('totp')
    expect(auth.step).toBe('totp')
    expect(auth.challengeToken).toBeTruthy()
    expect(auth.isAuthenticated).toBe(false)
    expect(auth.token).toBeNull()
  })

  it('login() rejects wrong credentials with a 401 ApiError', async () => {
    const auth = useAuthStore()
    await expect(auth.login(mockCredentials.email, 'wrong')).rejects.toMatchObject({
      name: 'ApiError',
      status: 401,
    })
    expect(auth.step).toBe('credentials')
  })

  it('verifyTotp() stores the token in the cookie and the user in state', async () => {
    const auth = useAuthStore()
    await auth.login(mockCredentials.email, mockCredentials.password)
    const user = await auth.verifyTotp(mockCredentials.totpCode)

    expect(user.email).toBe(mockCredentials.email)
    expect(auth.isAuthenticated).toBe(true)
    expect(auth.token).toBe('mock-access-token')
    expect(auth.user?.role).toBe('admin')
    expect(auth.step).toBe('credentials')
    // Cookie writes are flushed by a watcher: re-read document.cookie after a tick.
    await nextTick()
    expect(useCookie<string | null>(AUTH_COOKIE_NAME).value).toBe('mock-access-token')
  })

  it('verifyTotp() with a wrong code keeps the challenge and throws 401', async () => {
    const auth = useAuthStore()
    await auth.login(mockCredentials.email, mockCredentials.password)
    await expect(auth.verifyTotp('000000')).rejects.toSatisfy(
      (error: unknown) => ApiError.is(error) && error.status === 401,
    )
    expect(auth.isAuthenticated).toBe(false)
    expect(auth.step).toBe('totp')
  })

  it('verifyTotp() without a pending challenge throws', async () => {
    const auth = useAuthStore()
    await expect(auth.verifyTotp('123456')).rejects.toThrow(/challenge/)
  })

  it('logout() clears cookie, user and challenge', async () => {
    const auth = useAuthStore()
    await auth.login(mockCredentials.email, mockCredentials.password)
    await auth.verifyTotp(mockCredentials.totpCode)
    await auth.logout()

    expect(auth.isAuthenticated).toBe(false)
    expect(auth.user).toBeNull()
    await nextTick()
    expect(useCookie<string | null>(AUTH_COOKIE_NAME).value).toBeFalsy()
  })

  it('fetchMe() restores the user from an existing token', async () => {
    const auth = useAuthStore()
    await auth.login(mockCredentials.email, mockCredentials.password)
    await auth.verifyTotp(mockCredentials.totpCode)
    auth.$patch({ user: null })

    const user = await auth.fetchMe()
    expect(user?.email).toBe(mockCredentials.email)
    expect(auth.user?.email).toBe(mockCredentials.email)
  })
})
