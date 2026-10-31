import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useAuthStore } from '../stores/auth'
import { useAdministrationApi } from '../composables/useAdministrationApi'
import { useCatalogueApi } from '../composables/useCatalogueApi'
import { useRightsApi } from '../composables/useRightsApi'
import { useStatsApi } from '../composables/useStatsApi'
import { ApiError } from '../utils/api-error'
import { mockCredentials, mockTiming, resetMockState } from '../mocks'

/** Le Prince oublié: seeded with an active, indefinite rights contract. */
const SERIES_ACTIVE = 'ser_01HZX0A1B2C3D4E5F6G7H8J9K0'
/** Mariage sous contrat: seeded with a contract whose license ended in the past (EXPIRED). */
const SERIES_EXPIRED = 'ser_01HZX0A1B2C3D4E5F6G7H8J9K1'
/** Retour à Abidjan: no contract at all (NONE), has a READY episode to publish. */
const SERIES_NONE = 'ser_01HZX0A1B2C3D4E5F6G7H8J9K3'

async function signInAdmin(email = mockCredentials.email): Promise<void> {
  const auth = useAuthStore()
  auth.clearSession()
  await auth.login(email, mockCredentials.password)
  await auth.verifyTotp(mockCredentials.totpCode)
}

describe('mock API — rights and contracts, dashboard completion (B-11, B-12, sprint 9)', () => {
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

  it('derives NONE / ACTIVE / EXPIRED on the seeded fixture series', async () => {
    await signInAdmin()
    const catalogue = useCatalogueApi()
    expect((await catalogue.getSeries(SERIES_ACTIVE)).rightsStatus).toBe('ACTIVE')
    expect((await catalogue.getSeries(SERIES_EXPIRED)).rightsStatus).toBe('EXPIRED')
    expect((await catalogue.getSeries(SERIES_NONE)).rightsStatus).toBe('NONE')
  })

  it('EDITOR can read a contract but not create one (403)', async () => {
    await signInAdmin('editor@drama.local')
    const rights = useRightsApi()
    const contract = await rights.getContract(SERIES_ACTIVE)
    expect(contract.rightsHolder).toBe('Studio Awalé Productions')
    await expect(
      rights.createContract(SERIES_NONE, {
        rightsHolder: 'X',
        territories: [],
        licenseStartsAt: new Date().toISOString(),
        licenseEndsAt: null,
        notes: null,
      }),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('404s on a series with no contract, 409 on creating a second one', async () => {
    await signInAdmin('money@drama.local')
    const rights = useRightsApi()
    await expect(rights.getContract(SERIES_NONE)).rejects.toMatchObject({
      status: 404,
      code: 'RIGHTS_CONTRACT_NOT_FOUND',
    })
    await expect(
      rights.createContract(SERIES_ACTIVE, {
        rightsHolder: 'Y',
        territories: [],
        licenseStartsAt: new Date().toISOString(),
        licenseEndsAt: null,
        notes: null,
      }),
    ).rejects.toMatchObject({ status: 409, code: 'RIGHTS_CONTRACT_ALREADY_EXISTS' })
  })

  it('MONETIZATION creates, updates and deletes a contract; status follows the dates', async () => {
    await signInAdmin('money@drama.local')
    const rights = useRightsApi()
    const catalogue = useCatalogueApi()

    const created = await rights.createContract(SERIES_NONE, {
      rightsHolder: 'Le client',
      territories: [],
      licenseStartsAt: '2026-01-01T00:00:00.000Z',
      licenseEndsAt: null,
      notes: null,
    })
    expect(created.rightsHolder).toBe('Le client')
    expect((await catalogue.getSeries(SERIES_NONE)).rightsStatus).toBe('ACTIVE')

    await rights.updateContract(SERIES_NONE, { licenseEndsAt: '2020-01-01T00:00:00.000Z' })
    expect((await catalogue.getSeries(SERIES_NONE)).rightsStatus).toBe('EXPIRED')

    await rights.deleteContract(SERIES_NONE)
    expect((await catalogue.getSeries(SERIES_NONE)).rightsStatus).toBe('NONE')
    await expect(rights.getContract(SERIES_NONE)).rejects.toMatchObject({ status: 404 })
  })

  it('publishing without an active contract never blocks, but logs an audit warning', async () => {
    await signInAdmin()
    const catalogue = useCatalogueApi()
    const admin = useAdministrationApi()

    const publishedNone = await catalogue.publishSeries(SERIES_NONE)
    expect(publishedNone.status).toBe('PUBLISHED')
    expect(publishedNone.rightsStatus).toBe('NONE')
    const warnings = await admin.listAuditLogs({
      targetType: 'series',
      targetId: SERIES_NONE,
      action: 'series.publish_rights_warning',
    })
    expect(warnings.items).toHaveLength(1)
    expect(warnings.items[0]?.newValue).toMatchObject({ rightsStatus: 'NONE' })

    const publishedActive = await catalogue.publishSeries(SERIES_ACTIVE)
    expect(publishedActive.rightsStatus).toBe('ACTIVE')
    const noWarning = await admin.listAuditLogs({
      targetType: 'series',
      targetId: SERIES_ACTIVE,
      action: 'series.publish_rights_warning',
    })
    expect(noWarning.items).toHaveLength(0)
  })

  it('the renewal list covers every series and filters to what needs attention', async () => {
    await signInAdmin()
    const rights = useRightsApi()
    const all = await rights.listContracts()
    expect(all.items.map((item) => item.seriesId)).toContain(SERIES_ACTIVE)
    expect(all.items.find((item) => item.seriesId === SERIES_EXPIRED)?.rightsStatus).toBe('EXPIRED')

    const filtered = await rights.listContracts({ expiringWithinDays: 36500 })
    expect(filtered.items.some((item) => item.seriesId === SERIES_ACTIVE)).toBe(false)
    expect(filtered.items.some((item) => item.seriesId === SERIES_EXPIRED)).toBe(true)
    expect(filtered.items.some((item) => item.seriesId === SERIES_NONE)).toBe(true)
  })

  it('overview exposes revenue by source, paywall conversion and the window', async () => {
    await signInAdmin()
    const stats = useStatsApi()
    const overview = await stats.overview(7)
    expect(overview.days).toBe(7)
    expect(overview.revenueBySource?.length).toBeGreaterThan(0)
    expect(overview.paywallConversion).toMatchObject({ windowHours: 24 })
    expect(overview.unlocks).toBeGreaterThan(0)
  })

  it('retention is a decreasing curve from the episode-1 cohort, 404 on an unknown series', async () => {
    await signInAdmin()
    const stats = useStatsApi()
    const retention = await stats.retention(SERIES_ACTIVE)
    expect(retention.seriesId).toBe(SERIES_ACTIVE)
    expect(retention.points[0]).toMatchObject({ episodeNumber: 1, retentionPercent: 100 })
    for (let i = 1; i < retention.points.length; i += 1) {
      expect(retention.points[i]!.viewers).toBeLessThanOrEqual(retention.points[i - 1]!.viewers)
    }

    const whole = await stats.retention()
    expect(whole.seriesId).toBeNull()
    expect(whole.points.length).toBeGreaterThan(0)

    await expect(stats.retention('does-not-exist')).rejects.toSatisfy(
      (err: unknown) => ApiError.is(err) && err.status === 404,
    )
  })
})
