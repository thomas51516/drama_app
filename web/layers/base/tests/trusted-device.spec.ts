import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AUTH_COOKIE_NAME, DEVICE_COOKIE_NAME, useAuthStore } from '../stores/auth'
import { useAccountApi } from '../composables/useAccountApi'
import { useAdministrationApi } from '../composables/useAdministrationApi'
import { mockCredentials, mockTiming, resetMockState } from '../mocks'

/** B-13+ (contract v1.3): trusted device cookie and the no-code login path, in mock mode. */
describe('trusted device flow (auth store + mock API)', () => {
  const timing = { ...mockTiming }
  const editor = 'editor@drama.local'

  beforeEach(() => {
    Object.assign(mockTiming, { latencyMs: 0 })
    resetMockState()
    const auth = useAuthStore()
    auth.clearSession()
    auth.forgetDevice()
  })

  afterEach(() => {
    Object.assign(mockTiming, timing)
    resetMockState()
    const auth = useAuthStore()
    auth.clearSession()
    auth.forgetDevice()
  })

  it('verifyTotp() without rememberDevice stores no device token', async () => {
    const auth = useAuthStore()
    await auth.login(editor, mockCredentials.password)
    await auth.verifyTotp(mockCredentials.totpCode)
    expect(auth.hasTrustedDevice).toBe(false)
    await nextTick()
    expect(useCookie<string | null>(DEVICE_COOKIE_NAME).value).toBeFalsy()
    expect(await useAccountApi().listDevices()).toEqual([])
  })

  it('verifyTotp(code, true) stores the device token in the 30-day cookie and lists the device', async () => {
    const auth = useAuthStore()
    await auth.login(editor, mockCredentials.password)
    await auth.verifyTotp(mockCredentials.totpCode, true)

    expect(auth.hasTrustedDevice).toBe(true)
    expect(auth.deviceToken).toMatch(/^[0-9a-f]{64}$/)
    await nextTick()
    expect(useCookie<string | null>(DEVICE_COOKIE_NAME).value).toBe(auth.deviceToken)

    const devices = await useAccountApi().listDevices()
    expect(devices).toHaveLength(1)
    expect(devices[0]).toMatchObject({
      id: expect.any(String),
      label: expect.any(String),
      createdAt: expect.any(String),
      expiresAt: expect.any(String),
      current: true,
    })
    const ttlDays =
      (new Date(devices[0]!.expiresAt).getTime() - new Date(devices[0]!.createdAt).getTime()) /
      86_400_000
    expect(Math.round(ttlDays)).toBe(30)
  })

  it('logout keeps the device cookie, and the next login skips the code (status ok → done)', async () => {
    const auth = useAuthStore()
    await auth.login(editor, mockCredentials.password)
    await auth.verifyTotp(mockCredentials.totpCode, true)
    const deviceToken = auth.deviceToken

    await auth.logout()
    expect(auth.isAuthenticated).toBe(false)
    expect(auth.deviceToken).toBe(deviceToken)
    await nextTick()
    expect(useCookie<string | null>(AUTH_COOKIE_NAME).value).toBeFalsy()
    expect(useCookie<string | null>(DEVICE_COOKIE_NAME).value).toBe(deviceToken)

    const step = await auth.login(editor, mockCredentials.password)
    expect(step).toBe('done')
    expect(auth.isAuthenticated).toBe(true)
    expect(auth.user?.email).toBe(editor)
    expect(auth.step).toBe('credentials')
    expect(auth.challengeToken).toBeNull()
  })

  it('a 401 on a protected route clears the session but not the device cookie', async () => {
    const auth = useAuthStore()
    await auth.login(editor, mockCredentials.password)
    await auth.verifyTotp(mockCredentials.totpCode, true)
    const deviceToken = auth.deviceToken

    auth.token = 'revoked-token'
    await expect(useApi().get('/admin/auth/me')).rejects.toMatchObject({ status: 401 })
    expect(auth.isAuthenticated).toBe(false)
    expect(auth.deviceToken).toBe(deviceToken)
  })

  it('the device token is bound to the account: another account still gets the TOTP step', async () => {
    const auth = useAuthStore()
    await auth.login(editor, mockCredentials.password)
    await auth.verifyTotp(mockCredentials.totpCode, true)
    await auth.logout()

    const step = await auth.login(mockCredentials.email, mockCredentials.password)
    expect(step).toBe('totp')
    expect(auth.isAuthenticated).toBe(false)
    // The foreign token was ignored, not deleted.
    expect(auth.hasTrustedDevice).toBe(true)
  })

  it('revoking the device server-side makes the next login ask for a code again', async () => {
    const auth = useAuthStore()
    await auth.login(editor, mockCredentials.password)
    await auth.verifyTotp(mockCredentials.totpCode, true)

    const api = useAccountApi()
    const [device] = await api.listDevices()
    await api.revokeDevice(device!.id)
    expect(await api.listDevices()).toEqual([])
    auth.forgetDevice()
    expect(auth.hasTrustedDevice).toBe(false)

    await auth.logout()
    expect(await auth.login(editor, mockCredentials.password)).toBe('totp')
  })

  it('a stale cookie (device revoked elsewhere) falls back to the TOTP step silently', async () => {
    const auth = useAuthStore()
    await auth.login(editor, mockCredentials.password)
    await auth.verifyTotp(mockCredentials.totpCode, true)
    const api = useAccountApi()
    const [device] = await api.listDevices()
    await api.revokeDevice(device!.id)
    await auth.logout()

    expect(auth.hasTrustedDevice).toBe(true)
    expect(await auth.login(editor, mockCredentials.password)).toBe('totp')
  })

  it('ADMIN revoke-devices and reset-totp revoke every device of the account', async () => {
    const auth = useAuthStore()
    await auth.login(editor, mockCredentials.password)
    await auth.verifyTotp(mockCredentials.totpCode, true)
    const editorId = auth.user!.id
    await auth.logout()

    // Admin signs in (own TOTP, no device) and revokes the editor's devices.
    await auth.login(mockCredentials.email, mockCredentials.password)
    await auth.verifyTotp(mockCredentials.totpCode)
    await useAccountApi().revokeAccountDevices(editorId)
    await auth.logout()

    expect(await auth.login(editor, mockCredentials.password)).toBe('totp')
    await auth.verifyTotp(mockCredentials.totpCode, true)
    await auth.logout()
    expect(await auth.login(editor, mockCredentials.password)).toBe('done')
    await auth.logout()

    await auth.login(mockCredentials.email, mockCredentials.password)
    await auth.verifyTotp(mockCredentials.totpCode)
    await useAdministrationApi().resetTotp(editorId)
    await auth.logout()
    // TOTP reset → enrolment again, and the device is gone.
    expect(await auth.login(editor, mockCredentials.password)).toBe('totp_setup')
  })
})
