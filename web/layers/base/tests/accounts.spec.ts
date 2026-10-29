import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useAuthStore } from '../stores/auth'
import { useAdministrationApi } from '../composables/useAdministrationApi'
import { mockCredentials, mockTiming, resetMockState } from '../mocks'
import type { AdminAccount } from '../types/api'
import {
  accountPatch,
  emptyAccountForm,
  generatePassword,
  isSelf,
  passwordProblems,
  selfLockoutReason,
  validateAccountForm,
} from '../utils/accounts'

const ME = { id: 'adm_me' }
const account = (overrides: Partial<AdminAccount> = {}): AdminAccount => ({
  id: 'adm_me',
  email: 'me@drama.local',
  displayName: 'Moi',
  role: 'ADMIN',
  isActive: true,
  totpEnrolled: true,
  lastLoginAt: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  ...overrides,
})

async function signIn(
  email = mockCredentials.email,
  password = mockCredentials.password,
): Promise<void> {
  const auth = useAuthStore()
  auth.clearSession()
  await auth.login(email, password)
  await auth.verifyTotp(mockCredentials.totpCode)
}

describe('accounts helpers (B-13) — self-lockout guard', () => {
  it('blocks deactivating or demoting oneself only', () => {
    expect(selfLockoutReason(ME, account(), { isActive: false })).toBe('selfDeactivate')
    expect(selfLockoutReason(ME, account(), { role: 'EDITOR' })).toBe('selfDemote')
    expect(
      selfLockoutReason(ME, account(), { role: 'ADMIN', displayName: 'Nouveau nom' }),
    ).toBeNull()
    expect(selfLockoutReason(ME, account({ id: 'adm_other' }), { isActive: false })).toBeNull()
    expect(selfLockoutReason(null, account(), { isActive: false })).toBeNull()
    // Not an admin yet: changing one's own role is not a demotion from ADMIN.
    expect(selfLockoutReason(ME, account({ role: 'EDITOR' }), { role: 'SUPPORT' })).toBeNull()
    expect(isSelf(ME, account())).toBe(true)
    expect(isSelf(ME, account({ id: 'x' }))).toBe(false)
  })

  it('builds a PATCH with only the changed fields', () => {
    const target = account()
    expect(accountPatch(target, { displayName: 'Moi', role: 'ADMIN', isActive: true })).toEqual({})
    expect(
      accountPatch(target, { displayName: '  Nouveau  ', role: 'EDITOR', isActive: false }),
    ).toEqual({
      displayName: 'Nouveau',
      role: 'EDITOR',
      isActive: false,
    })
  })
})

describe('accounts helpers (B-13) — form and password', () => {
  it('validates the creation form', () => {
    expect(validateAccountForm(emptyAccountForm())).toMatchObject({
      email: 'validation.required',
      displayName: 'validation.required',
      password: 'validation.passwordLength',
    })
    expect(
      validateAccountForm({
        email: 'nope',
        displayName: 'x',
        role: 'EDITOR',
        password: 'Abcdefghijk1',
      }),
    ).toEqual({
      email: 'validation.email',
    })
    expect(
      validateAccountForm({
        email: 'a@b.co',
        displayName: 'x',
        role: 'EDITOR',
        password: 'abcdefghijkl1',
      }),
    ).toEqual({
      password: 'validation.passwordCase',
    })
  })

  it('generates passwords satisfying the policy', () => {
    for (let i = 0; i < 25; i += 1) {
      const password = generatePassword()
      expect(password).toHaveLength(16)
      expect(passwordProblems(password)).toEqual([])
    }
    expect(generatePassword(8)).toHaveLength(12)
    expect(new Set(Array.from({ length: 10 }, () => generatePassword())).size).toBe(10)
  })
})

describe('mock accounts and audit API', () => {
  const timing = { ...mockTiming }

  beforeEach(() => {
    Object.assign(mockTiming, { latencyMs: 0 })
    resetMockState()
  })

  afterEach(() => {
    Object.assign(mockTiming, timing)
    resetMockState()
    useAuthStore().clearSession()
  })

  it('is ADMIN-only', async () => {
    await signIn('editor@drama.local')
    const api = useAdministrationApi()
    await expect(api.listAccounts()).rejects.toMatchObject({ status: 403 })
    await expect(api.listAuditLogs()).rejects.toMatchObject({ status: 403 })
  })

  it('creates an account that can sign in, refuses self-lockout (409), resets TOTP and password, audits everything', async () => {
    await signIn()
    const auth = useAuthStore()
    const me = auth.user!
    const api = useAdministrationApi()

    const accounts = await api.listAccounts()
    expect(accounts.length).toBeGreaterThanOrEqual(5)
    expect(accounts.find((a) => a.email === 'former@drama.local')?.isActive).toBe(false)

    const created = await api.createAccount({
      email: 'New.Editor@drama.local',
      displayName: 'Nouvel Éditeur',
      role: 'EDITOR',
      password: 'StrongPassw0rd!',
    })
    expect(created).toMatchObject({
      email: 'new.editor@drama.local',
      role: 'EDITOR',
      isActive: true,
      totpEnrolled: false,
      lastLoginAt: null,
    })
    await expect(
      api.createAccount({
        email: 'new.editor@drama.local',
        displayName: 'Doublon',
        role: 'EDITOR',
        password: 'StrongPassw0rd!',
      }),
    ).rejects.toMatchObject({ status: 409, code: 'EMAIL_ALREADY_USED' })
    await expect(
      api.createAccount({
        email: 'weak@drama.local',
        displayName: 'Faible',
        role: 'EDITOR',
        password: 'short',
      }),
    ).rejects.toMatchObject({ status: 400, code: 'WEAK_PASSWORD' })

    await expect(api.updateAccount(me.id, { isActive: false })).rejects.toMatchObject({
      status: 409,
      code: 'ADMIN_SELF_LOCKOUT',
    })
    await expect(api.updateAccount(me.id, { role: 'EDITOR' })).rejects.toMatchObject({
      status: 409,
      code: 'ADMIN_SELF_LOCKOUT',
    })
    await expect(api.updateAccount(me.id, { displayName: 'Admin renommé' })).resolves.toMatchObject(
      { displayName: 'Admin renommé' },
    )

    const promoted = await api.updateAccount(created.id, { role: 'MONETIZATION', isActive: false })
    expect(promoted).toMatchObject({ role: 'MONETIZATION', isActive: false })

    const editor = accounts.find((a) => a.email === 'editor@drama.local')!
    expect(editor.totpEnrolled).toBe(true)
    expect((await api.resetTotp(editor.id)).totpEnrolled).toBe(false)
    await api.resetPassword(editor.id, 'AnotherPassw0rd!')
    await expect(api.resetPassword(editor.id, 'weak')).rejects.toMatchObject({ status: 400 })

    const logs = await api.listAuditLogs({
      actorId: me.id,
      targetType: 'admin_account',
      pageSize: 50,
    })
    const actions = logs.items.map((log) => log.action)
    expect(actions).toEqual(
      expect.arrayContaining([
        'admin_account.create',
        'admin_account.update',
        'admin_account.reset_totp',
        'admin_account.reset_password',
      ]),
    )
    const update = logs.items.find(
      (log) => log.action === 'admin_account.update' && log.targetId === created.id,
    )!
    expect(update.oldValue).toEqual({ role: 'EDITOR', isActive: true })
    expect(update.newValue).toEqual({ role: 'MONETIZATION', isActive: false })
    expect(logs.items.every((log) => log.actorEmail === me.email)).toBe(true)

    const byAction = await api.listAuditLogs({ action: 'reset_' })
    expect(byAction.total).toBe(2)
    const paged = await api.listAuditLogs({ page: 2, pageSize: 3 })
    expect(paged.items).toHaveLength(3)
    expect(paged.page).toBe(2)
    const dated = await api.listAuditLogs({ from: '2030-01-01T00:00:00.000Z' })
    expect(dated.total).toBe(0)

    // The reset editor must enrol TOTP again with the new password; the deactivated one cannot sign in.
    auth.clearSession()
    await expect(auth.login('editor@drama.local', mockCredentials.password)).rejects.toMatchObject({
      status: 401,
    })
    expect(await auth.login('editor@drama.local', 'AnotherPassw0rd!')).toBe('totp_setup')
    await expect(auth.login('new.editor@drama.local', 'StrongPassw0rd!')).rejects.toMatchObject({
      status: 401,
      code: 'ACCOUNT_DISABLED',
    })
    await expect(auth.login('former@drama.local', mockCredentials.password)).rejects.toMatchObject({
      status: 401,
    })

    // Re-activated, the created account signs in with its own password (first login = TOTP setup).
    await signIn()
    await api.updateAccount(created.id, { isActive: true })
    auth.clearSession()
    expect(await auth.login('new.editor@drama.local', 'StrongPassw0rd!')).toBe('totp_setup')
    const user = await auth.verifyTotp(mockCredentials.totpCode)
    expect(user.role).toBe('MONETIZATION')
  })
})
