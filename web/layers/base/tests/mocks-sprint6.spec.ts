import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useAuthStore } from '../stores/auth'
import { useAdministrationApi } from '../composables/useAdministrationApi'
import { useMonetizationApi } from '../composables/useMonetizationApi'
import { useUsersApi } from '../composables/useUsersApi'
import { mockCredentials, mockTiming, resetMockState } from '../mocks'

async function signIn(email = mockCredentials.email): Promise<void> {
  const auth = useAuthStore()
  auth.clearSession()
  await auth.login(email, mockCredentials.password)
  await auth.verifyTotp(mockCredentials.totpCode)
}

const AWA = '0192f3a0-7c1e-7a10-8e00-000000000001'
const BLOCKED = '0192f3a0-7c1e-7a10-8e00-000000000004'

describe('mock API — monetization, rewards and users (contract v1.4)', () => {
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

  it('answers INVALID_TOTP_CODE like the backend for a wrong code (DEF-005)', async () => {
    const auth = useAuthStore()
    auth.clearSession()
    await auth.login(mockCredentials.email, mockCredentials.password)
    await expect(auth.verifyTotp('000000')).rejects.toMatchObject({
      status: 401,
      code: 'INVALID_TOTP_CODE',
    })
  })

  it('gates monetization to MONETIZATION/ADMIN and users to SUPPORT/ADMIN', async () => {
    await signIn('editor@drama.local')
    await expect(useMonetizationApi().getSettings()).rejects.toMatchObject({ status: 403 })
    await expect(useMonetizationApi().getCheckinScale()).rejects.toMatchObject({ status: 403 })
    await expect(useUsersApi().searchUsers({ q: 'awa' })).rejects.toMatchObject({ status: 403 })

    await signIn('support@drama.local')
    await expect(useMonetizationApi().listPacks()).rejects.toMatchObject({ status: 403 })
    const page = await useUsersApi().searchUsers({ q: 'awa' })
    expect(page.total).toBe(1)
  })

  it('updates the settings, validates them and audits the change', async () => {
    await signIn()
    const api = useMonetizationApi()
    const before = await api.getSettings()
    expect(before).toMatchObject({ defaultFreeEpisodes: 3, defaultCoinCost: 10 })

    await expect(api.updateSettings({ ...before, defaultCoinCost: 0 })).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    })
    const after = await api.updateSettings({ ...before, adDailyCap: 3, autoUnlockDefault: true })
    expect(after).toMatchObject({ adDailyCap: 3, autoUnlockDefault: true })
    expect(await api.getSettings()).toEqual(after)

    const logs = await useAdministrationApi().listAuditLogs({ targetType: 'monetization_settings' })
    expect(logs.items[0]).toMatchObject({
      action: 'monetization_settings.update',
      oldValue: { adDailyCap: 5 },
      newValue: { adDailyCap: 3 },
    })
  })

  it('creates, edits, reorders and deletes a coin pack; sku is unique and immutable', async () => {
    await signIn('money@drama.local')
    const api = useMonetizationApi()
    const initial = await api.listPacks()
    expect(initial.map((pack) => pack.position)).toEqual([1, 2, 3, 4])
    expect(initial[0]).toMatchObject({ sku: 'coins_100', price: { currency: 'XOF' } })

    await expect(
      api.createPack({
        sku: 'QA TEST',
        coins: 10,
        prices: [{ currency: 'XOF', amountMinor: 100 }],
      }),
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      api.createPack({
        sku: 'coins_100',
        coins: 10,
        prices: [{ currency: 'XOF', amountMinor: 100 }],
      }),
    ).rejects.toMatchObject({ status: 409, code: 'SKU_ALREADY_USED' })
    await expect(api.createPack({ sku: 'qa_test', coins: 10, prices: [] })).rejects.toMatchObject({
      status: 400,
    })

    const created = await api.createPack({
      sku: 'qa_test',
      coins: 50,
      bonusCoins: 5,
      badge: 'QA',
      isActive: false,
      prices: [
        { currency: 'XOF', amountMinor: 250 },
        { currency: 'USD', amountMinor: 45 },
      ],
    })
    expect(created).toMatchObject({ sku: 'qa_test', position: 5, isActive: false, badge: 'QA' })
    expect(created.price).toEqual({ currency: 'XOF', amountMinor: 250 })

    await expect(api.updatePack(created.id, { sku: 'other' })).rejects.toMatchObject({
      status: 400,
      code: 'SKU_IMMUTABLE',
    })
    const updated = await api.updatePack(created.id, { coins: 60, isActive: true })
    expect(updated).toMatchObject({ coins: 60, isActive: true, bonusCoins: 5 })

    const ids = (await api.listPacks()).map((pack) => pack.id)
    const reordered = await api.reorderPacks([ids[4] as string, ...ids.slice(0, 4)])
    expect(reordered[0]).toMatchObject({ id: created.id, position: 1 })
    await expect(api.reorderPacks(ids.slice(1))).rejects.toMatchObject({ status: 400 })

    await api.deletePack(created.id)
    const remaining = await api.listPacks()
    expect(remaining).toHaveLength(4)
    expect(remaining.map((pack) => pack.position)).toEqual([1, 2, 3, 4])
    await expect(api.deletePack(created.id)).rejects.toMatchObject({ status: 404 })

    // The audit log itself is ADMIN-only.
    await signIn()
    const logs = await useAdministrationApi().listAuditLogs({ targetType: 'coin_pack' })
    expect(logs.items.map((log) => log.action)).toEqual(
      expect.arrayContaining([
        'coin_pack.create',
        'coin_pack.update',
        'coin_pack.reorder',
        'coin_pack.delete',
      ]),
    )
  })

  it('manages VIP plans with a period and trial days', async () => {
    await signIn()
    const api = useMonetizationApi()
    const plans = await api.listVipPlans()
    expect(plans.map((plan) => plan.period)).toEqual(['WEEK', 'MONTH', 'YEAR'])

    await expect(
      api.createVipPlan({
        sku: 'vip_test',
        period: 'DECADE' as never,
        prices: [{ currency: 'XOF', amountMinor: 1 }],
      }),
    ).rejects.toMatchObject({ status: 400 })
    const created = await api.createVipPlan({
      sku: 'vip_test',
      period: 'MONTH',
      trialDays: 14,
      prices: [{ currency: 'XOF', amountMinor: 2500 }],
    })
    expect(created).toMatchObject({ period: 'MONTH', trialDays: 14, isActive: true })
    const updated = await api.updateVipPlan(created.id, { trialDays: 0, badge: 'Test' })
    expect(updated).toMatchObject({ trialDays: 0, badge: 'Test' })
    await api.deleteVipPlan(created.id)
    expect(await api.listVipPlans()).toHaveLength(3)
  })

  it('reads and updates the check-in scale (B-08)', async () => {
    await signIn('money@drama.local')
    const api = useMonetizationApi()
    expect(await api.getCheckinScale()).toEqual({
      days: [5, 5, 10, 10, 15, 15, 30],
      resetOnMiss: true,
    })
    await expect(api.updateCheckinScale({ days: [1, 2], resetOnMiss: true })).rejects.toMatchObject(
      {
        status: 400,
      },
    )
    await expect(
      api.updateCheckinScale({ days: [0, 0, 0, 0, 0, 0, 0], resetOnMiss: true }),
    ).rejects.toMatchObject({ status: 400 })
    const saved = await api.updateCheckinScale({
      days: [5, 10, 10, 15, 15, 20, 50],
      resetOnMiss: false,
    })
    expect(saved).toEqual({ days: [5, 10, 10, 15, 15, 20, 50], resetOnMiss: false })
    expect(await api.getCheckinScale()).toEqual(saved)
  })

  it('searches users by e-mail, phone, name and id prefix', async () => {
    await signIn('support@drama.local')
    const api = useUsersApi()
    expect((await api.searchUsers({ q: 'kone@' })).items[0]).toMatchObject({ id: AWA })
    expect((await api.searchUsers({ q: '+228 90 12' })).items[0]).toMatchObject({ id: AWA })
    expect((await api.searchUsers({ q: 'mensah' })).items[0]).toMatchObject({
      displayName: 'Kofi Mensah',
      vipStatus: 'active',
    })
    expect((await api.searchUsers({ q: '0192f3a0-7c1e-7a10-8e00-00000000000' })).total).toBe(5)
    expect((await api.searchUsers({ q: 'nobody' })).total).toBe(0)
    const page = await api.searchUsers({ q: '0192', page: 2, pageSize: 2 })
    expect(page).toMatchObject({ page: 2, pageSize: 2, total: 5 })
    expect(page.items).toHaveLength(2)
  })

  it('returns the detail with a wallet projected from the ledger', async () => {
    await signIn('support@drama.local')
    const detail = await useUsersApi().getUser(AWA)
    expect(detail.user).toMatchObject({ email: 'awa.kone@example.com', status: 'ACTIVE' })
    expect(detail.wallet).toMatchObject({ purchased: 180, bonus: 45, total: 225, autoUnlock: true })
    expect(detail.wallet.bonusExpiring.length).toBeGreaterThan(0)
    expect(detail.recentLedger[0]?.createdAt >= (detail.recentLedger[1]?.createdAt ?? '')).toBe(
      true,
    )
    expect(detail.unlocks).toHaveLength(3)
    expect(detail.purchases).toHaveLength(1)
    await expect(useUsersApi().getUser('missing')).rejects.toMatchObject({
      status: 404,
      code: 'USER_NOT_FOUND',
    })
  })

  it('credits and debits coins through an ADJUSTMENT line with a mandatory reason', async () => {
    await signIn('support@drama.local')
    const api = useUsersApi()
    await expect(
      api.adjustCoins(AWA, { amount: 10, bucket: 'BONUS', reason: 'court' }),
    ).rejects.toMatchObject({ status: 400, code: 'REASON_REQUIRED' })
    await expect(
      api.adjustCoins(AWA, { amount: 0, bucket: 'BONUS', reason: 'Motif suffisamment long' }),
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      api.adjustCoins(AWA, {
        amount: -500,
        bucket: 'PURCHASED',
        reason: 'Motif suffisamment long',
      }),
    ).rejects.toMatchObject({ status: 409, code: 'INSUFFICIENT_COINS' })

    const credited = await api.adjustCoins(AWA, {
      amount: 50,
      bucket: 'BONUS',
      reason: 'Geste commercial ticket #42',
    })
    expect(credited).toMatchObject({ purchased: 180, bonus: 95, total: 275 })
    const debited = await api.adjustCoins(AWA, {
      amount: -30,
      bucket: 'PURCHASED',
      reason: 'Correction après remboursement',
    })
    expect(debited).toMatchObject({ purchased: 150, bonus: 95, total: 245 })

    const detail = await api.getUser(AWA)
    expect(detail.wallet.total).toBe(245)
    expect(detail.recentLedger[0]).toMatchObject({
      type: 'ADJUSTMENT',
      amount: -30,
      bucket: 'PURCHASED',
      description: 'Correction après remboursement',
    })
    expect(detail.recentLedger[1]).toMatchObject({
      type: 'ADJUSTMENT',
      amount: 50,
      bucket: 'BONUS',
    })
    expect(detail.recentLedger[1]?.expiresAt).toBeTruthy()

    await signIn()
    const logs = await useAdministrationApi().listAuditLogs({ targetType: 'user', targetId: AWA })
    expect(logs.items[0]).toMatchObject({
      action: 'user.coins_adjust',
      actorEmail: 'support@drama.local',
      newValue: { amount: -30, reason: 'Correction après remboursement' },
    })
  })

  it('blocks and unblocks a user with a reason, refusing invalid transitions', async () => {
    await signIn('support@drama.local')
    const api = useUsersApi()
    await expect(api.blockUser(AWA, { reason: 'x' })).rejects.toMatchObject({ status: 400 })
    await expect(api.blockUser(BLOCKED, { reason: 'Déjà bloqué pourtant' })).rejects.toMatchObject({
      status: 409,
      code: 'USER_ALREADY_BLOCKED',
    })
    await expect(api.unblockUser(AWA, { reason: 'Pas bloqué pourtant' })).rejects.toMatchObject({
      status: 409,
      code: 'USER_NOT_BLOCKED',
    })

    const blocked = await api.blockUser(AWA, { reason: 'Fraude au remboursement confirmée' })
    expect(blocked.status).toBe('BLOCKED')
    expect((await api.getUser(AWA)).devices).toBe(0)
    const unblocked = await api.unblockUser(AWA, { reason: 'Erreur de notre part, désolé' })
    expect(unblocked.status).toBe('ACTIVE')

    await signIn()
    const logs = await useAdministrationApi().listAuditLogs({ targetType: 'user', targetId: AWA })
    expect(logs.items.slice(0, 2).map((log) => log.action)).toEqual(['user.unblock', 'user.block'])
  })
})
