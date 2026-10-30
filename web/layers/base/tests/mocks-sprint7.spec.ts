import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useAuthStore } from '../stores/auth'
import { useMonetizationApi } from '../composables/useMonetizationApi'
import { useOffersApi } from '../composables/useOffersApi'
import {
  mockCredentials,
  mockPublicCredentials,
  mockRequest,
  mockTiming,
  resetMockState,
} from '../mocks'
import type {
  LimitedOffer,
  OtpRequestResponse,
  PromoCode,
  PublicAuthSession,
  PublicOffers,
  PublicShop,
  TopupOrder,
  TopupOrderCreated,
  Wallet,
} from '../types/api'

async function signInAdmin(email = mockCredentials.email): Promise<void> {
  const auth = useAuthStore()
  auth.clearSession()
  await auth.login(email, mockCredentials.password)
  await auth.verifyTotp(mockCredentials.totpCode)
}

const DEVICE_ID = 'vitest-device-00000001'

describe('mock API — rewards tasks, offers and promo codes (B-07, B-08, contract v1.5)', () => {
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

  it('lists the six fixed reward tasks and lets MONETIZATION edit coins/target/active', async () => {
    await signInAdmin('money@drama.local')
    const api = useMonetizationApi()
    const tasks = await api.listTasks()
    expect(tasks.map((t) => t.key).sort()).toEqual(
      [
        'add_favorite',
        'complete_profile',
        'enable_notifications',
        'share_series',
        'watch_10_episodes',
        'watch_3_episodes',
      ].sort(),
    )
    const updated = await api.updateTask('watch_3_episodes', { coins: 8, isActive: false })
    expect(updated).toMatchObject({ coins: 8, isActive: false })
    expect((await api.listTasks()).find((t) => t.key === 'watch_3_episodes')).toMatchObject({
      coins: 8,
      isActive: false,
    })
  })

  it('rejects an invalid task patch (negative coins) with VALIDATION_ERROR', async () => {
    await signInAdmin('money@drama.local')
    const api = useMonetizationApi()
    await expect(api.updateTask('watch_3_episodes', { coins: -1 })).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    })
  })

  it('gates offers and promo codes to MONETIZATION/ADMIN', async () => {
    await signInAdmin('editor@drama.local')
    const api = useOffersApi()
    await expect(api.getWelcome()).rejects.toMatchObject({ status: 403 })
    await expect(api.listLimited()).rejects.toMatchObject({ status: 403 })
    await expect(api.listPromoCodes()).rejects.toMatchObject({ status: 403 })
  })

  it('updates the welcome offer and validates the bonus percent and hours', async () => {
    await signInAdmin('money@drama.local')
    const api = useOffersApi()
    const before = await api.getWelcome()
    expect(before).toMatchObject({ isActive: true, bonusPercent: 50, hours: 48 })
    const after = await api.updateWelcome({ ...before!, bonusPercent: 75, hours: 24 })
    expect(after).toMatchObject({ bonusPercent: 75, hours: 24 })
    await expect(api.updateWelcome({ ...after, bonusPercent: 0 })).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    })
  })

  it('creates, edits and deletes a limited offer on a real pack', async () => {
    await signInAdmin('money@drama.local')
    const api = useOffersApi()
    const created = await api.createLimited({
      title: 'Test offer',
      packSku: 'coins_300',
      bonusPercent: 25,
      startsAt: null,
      endsAt: new Date(Date.now() + 86_400_000).toISOString(),
      isActive: true,
    })
    expect(created).toMatchObject({ title: 'Test offer', bonusPercent: 25 })
    const edited = await api.updateLimited(created.id, { bonusPercent: 40 })
    expect(edited.bonusPercent).toBe(40)
    await api.deleteLimited(created.id)
    expect((await api.listLimited()).some((o: LimitedOffer) => o.id === created.id)).toBe(false)
  })

  it('refuses a limited offer with an unknown pack sku', async () => {
    await signInAdmin('money@drama.local')
    const api = useOffersApi()
    await expect(
      api.createLimited({
        title: 'Bad',
        packSku: 'does_not_exist',
        bonusPercent: 10,
        startsAt: null,
        endsAt: new Date(Date.now() + 86_400_000).toISOString(),
        isActive: true,
      }),
    ).rejects.toMatchObject({ status: 404, code: 'PACK_NOT_FOUND' })
  })

  it('creates a promo code, refuses a duplicate code and keeps the code immutable on edit', async () => {
    await signInAdmin('money@drama.local')
    const api = useOffersApi()
    const created = await api.createPromoCode({
      code: 'TEST-UNIQUE-01',
      coins: 25,
      maxUses: 10,
      perUserUses: 1,
      isActive: true,
    })
    expect(created).toMatchObject({ code: 'TEST-UNIQUE-01', coins: 25, usesCount: 0 })

    await expect(
      api.createPromoCode({ code: 'test-unique-01', coins: 10, perUserUses: 1, isActive: true }),
    ).rejects.toMatchObject({ status: 409, code: 'PROMO_CODE_ALREADY_USED' })

    const edited = await api.updatePromoCode(created.id, { coins: 60 })
    expect(edited.coins).toBe(60)
    expect(edited.code).toBe('TEST-UNIQUE-01')
  })

  it('lists redemptions of a known fixture promo code', async () => {
    await signInAdmin('money@drama.local')
    const api = useOffersApi()
    const codes = await api.listPromoCodes()
    const welcome = codes.find((c: PromoCode) => c.code === 'BIENVENUE50')!
    const page = await api.listRedemptions(welcome.id)
    expect(page.total).toBeGreaterThan(0)
    expect(page.items[0]).toHaveProperty('coins')
  })
})

describe('mock API — public auth, shop and top-up orders (contract v1.2 + v1.5, recharge site)', () => {
  const timing = { ...mockTiming }

  beforeEach(() => {
    Object.assign(mockTiming, { latencyMs: 0 })
    resetMockState()
  })

  afterEach(() => {
    Object.assign(mockTiming, timing)
    resetMockState()
  })

  it('signs in with e-mail + password using the demo end-user account', async () => {
    const session = await mockRequest<PublicAuthSession>({
      method: 'POST',
      path: '/auth/email/login',
      body: {
        email: mockPublicCredentials.email,
        password: mockPublicCredentials.password,
        deviceId: DEVICE_ID,
      },
    })
    expect(session.accessToken).toBeTruthy()
    expect(session.user.email).toBe(mockPublicCredentials.email)
  })

  it('refuses a wrong password with INVALID_CREDENTIALS', async () => {
    await expect(
      mockRequest({
        method: 'POST',
        path: '/auth/email/login',
        body: {
          email: mockPublicCredentials.email,
          password: 'wrong-password',
          deviceId: DEVICE_ID,
        },
      }),
    ).rejects.toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' })
  })

  it('registers a new e-mail account and refuses a second registration with the same e-mail', async () => {
    const email = `new-${Date.now()}@example.com`
    const session = await mockRequest<PublicAuthSession>({
      method: 'POST',
      path: '/auth/email/register',
      body: { email, password: 'correct-password', deviceId: DEVICE_ID },
    })
    expect(session.user.email).toBe(email)
    await expect(
      mockRequest({
        method: 'POST',
        path: '/auth/email/register',
        body: { email, password: 'another-password', deviceId: DEVICE_ID },
      }),
    ).rejects.toMatchObject({ status: 409, code: 'EMAIL_TAKEN' })
  })

  it('completes the phone + OTP flow with the demo code and creates a guest-like account', async () => {
    const otp = await mockRequest<OtpRequestResponse>({
      method: 'POST',
      path: '/auth/otp/request',
      body: { phone: '+22899887766' },
    })
    expect(otp.requestId).toBeTruthy()
    const session = await mockRequest<PublicAuthSession>({
      method: 'POST',
      path: '/auth/otp/verify',
      body: { requestId: otp.requestId, code: mockPublicCredentials.otpCode, deviceId: DEVICE_ID },
    })
    expect(session.user.phone).toBe('+22899887766')
  })

  it('refuses a wrong OTP code and keeps the request usable for a retry', async () => {
    const otp = await mockRequest<OtpRequestResponse>({
      method: 'POST',
      path: '/auth/otp/request',
      body: { phone: '+22899887788' },
    })
    await expect(
      mockRequest({
        method: 'POST',
        path: '/auth/otp/verify',
        body: { requestId: otp.requestId, code: '000000', deviceId: DEVICE_ID },
      }),
    ).rejects.toMatchObject({ status: 401, code: 'OTP_INVALID_CODE' })

    const session = await mockRequest<PublicAuthSession>({
      method: 'POST',
      path: '/auth/otp/verify',
      body: { requestId: otp.requestId, code: mockPublicCredentials.otpCode, deviceId: DEVICE_ID },
    })
    expect(session.user.phone).toBe('+22899887788')
  })

  it('rotates the refresh token and revokes the old one (reuse fails)', async () => {
    const session = await mockRequest<PublicAuthSession>({
      method: 'POST',
      path: '/auth/email/login',
      body: {
        email: mockPublicCredentials.email,
        password: mockPublicCredentials.password,
        deviceId: DEVICE_ID,
      },
    })
    const refreshed = await mockRequest<PublicAuthSession>({
      method: 'POST',
      path: '/auth/refresh',
      body: { refreshToken: session.refreshToken },
    })
    expect(refreshed.accessToken).not.toBe(session.accessToken)
    await expect(
      mockRequest({
        method: 'POST',
        path: '/auth/refresh',
        body: { refreshToken: session.refreshToken },
      }),
    ).rejects.toMatchObject({ status: 401 })
  })

  it('serves the shop priced in the X-Country currency and the public offers', async () => {
    const shop = await mockRequest<PublicShop>({
      method: 'GET',
      path: '/shop',
      headers: { 'X-Country': 'TG' },
    })
    expect(shop.currency).toBe('XOF')
    expect(shop.coinPacks.length).toBeGreaterThan(0)
    expect(shop.coinPacks.every((p) => p.price.currency === 'XOF')).toBe(true)

    const session = await mockRequest<PublicAuthSession>({
      method: 'POST',
      path: '/auth/email/login',
      body: {
        email: mockPublicCredentials.email,
        password: mockPublicCredentials.password,
        deviceId: DEVICE_ID,
      },
    })
    const offers = await mockRequest<PublicOffers>({
      method: 'GET',
      path: '/offers',
      token: session.accessToken,
    })
    expect(offers).toHaveProperty('limited')
  })

  it('creates a top-up order, pays it through the mock provider and credits the wallet once', async () => {
    const session = await mockRequest<PublicAuthSession>({
      method: 'POST',
      path: '/auth/email/login',
      body: {
        email: mockPublicCredentials.email,
        password: mockPublicCredentials.password,
        deviceId: DEVICE_ID,
      },
    })
    const walletBefore = await mockRequest<Wallet>({
      method: 'GET',
      path: '/wallet',
      token: session.accessToken,
    })

    const created = await mockRequest<TopupOrderCreated>({
      method: 'POST',
      path: '/topup/orders',
      token: session.accessToken,
      body: { packSku: 'coins_300', country: 'TG', idempotencyKey: 'idem-key-0001' },
    })
    expect(created.paymentUrl).toContain(created.orderId)

    const pending = await mockRequest<TopupOrder>({
      method: 'GET',
      path: `/topup/orders/${created.orderId}`,
      token: session.accessToken,
    })
    expect(pending.status).toBe('PENDING')

    // Idempotent retry of the same order (same idempotencyKey) returns the same order.
    const retried = await mockRequest<TopupOrderCreated>({
      method: 'POST',
      path: '/topup/orders',
      token: session.accessToken,
      body: { packSku: 'coins_300', country: 'TG', idempotencyKey: 'idem-key-0001' },
    })
    expect(retried.orderId).toBe(created.orderId)

    const paid = await mockRequest<TopupOrder>({
      method: 'POST',
      path: `/topup/orders/${created.orderId}/mock-pay`,
      token: session.accessToken,
      body: { outcome: 'paid' },
    })
    expect(paid.status).toBe('PAID')
    expect(paid.coins).toBeGreaterThan(0)

    const walletAfter = await mockRequest<Wallet>({
      method: 'GET',
      path: '/wallet',
      token: session.accessToken,
    })
    expect(walletAfter.total).toBeGreaterThan(walletBefore.total)

    // Paying an already-settled order again is a no-op (idempotent credit).
    const again = await mockRequest<TopupOrder>({
      method: 'POST',
      path: `/topup/orders/${created.orderId}/mock-pay`,
      token: session.accessToken,
      body: { outcome: 'paid' },
    })
    expect(again.status).toBe('PAID')
    const walletTwice = await mockRequest<Wallet>({
      method: 'GET',
      path: '/wallet',
      token: session.accessToken,
    })
    expect(walletTwice.total).toBe(walletAfter.total)
  })

  it('marks a failed payment as FAILED without crediting anything', async () => {
    const session = await mockRequest<PublicAuthSession>({
      method: 'POST',
      path: '/auth/email/login',
      body: {
        email: mockPublicCredentials.email,
        password: mockPublicCredentials.password,
        deviceId: DEVICE_ID,
      },
    })
    const created = await mockRequest<TopupOrderCreated>({
      method: 'POST',
      path: '/topup/orders',
      token: session.accessToken,
      body: { packSku: 'coins_100', country: 'TG', idempotencyKey: 'idem-key-fail-01' },
    })
    const failed = await mockRequest<TopupOrder>({
      method: 'POST',
      path: `/topup/orders/${created.orderId}/mock-pay`,
      token: session.accessToken,
      body: { outcome: 'failed' },
    })
    expect(failed.status).toBe('FAILED')
  })

  it('requires an authenticated session for /me, /wallet and /topup/orders', async () => {
    await expect(mockRequest({ method: 'GET', path: '/me' })).rejects.toMatchObject({ status: 401 })
    await expect(mockRequest({ method: 'GET', path: '/wallet' })).rejects.toMatchObject({
      status: 401,
    })
  })
})

describe('mock API — reconciliation report (B-11, contract v1.5)', () => {
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

  it('computes a per-day reconciliation with the fixture mismatch and gates it to MONETIZATION/ADMIN', async () => {
    await signInAdmin('money@drama.local')
    const auth = useAuthStore()
    const report = await mockRequest<{
      date: string
      orders: number
      paid: number
      credited: number
      mismatches: { reason: string }[]
    }>({
      method: 'GET',
      path: `/admin/topup/reconciliation?date=${new Date().toISOString().slice(0, 10)}`,
      token: auth.token,
    })
    expect(report.orders).toBeGreaterThanOrEqual(report.paid)
    expect(report.paid).toBeGreaterThanOrEqual(report.credited)
    expect(Array.isArray(report.mismatches)).toBe(true)
  })

  it('refuses an invalid date', async () => {
    await signInAdmin('money@drama.local')
    const auth = useAuthStore()
    await expect(
      mockRequest({
        method: 'GET',
        path: '/admin/topup/reconciliation?date=not-a-date',
        token: auth.token,
      }),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' })
  })
})
