import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useAuthStore } from '../stores/auth'
import { useStatsApi } from '../composables/useStatsApi'
import { mockCredentials, mockTiming, resetMockState } from '../mocks'
import type { StatsOverview, StatsRevenueBySource } from '../types/api'
import {
  completionRate,
  deriveConversionView,
  deriveTiles,
  formatCount,
  formatPercent,
  formatRevenueAmount,
  isEmptyOverview,
  isStatsPeriod,
  rankTopSeries,
  retentionChartData,
  share,
  sortRevenueRows,
  STATS_REFRESH_INTERVAL_MS,
  STATS_SERIES_COLORS,
  topSeriesChartData,
} from '../utils/stats'

const overview: StatsOverview = {
  activeUsers: { d1: 120, d7: 480, d30: 1100 },
  newUsers: 190,
  registeredUsers: 300,
  guestUsers: 900,
  episodesStarted: 4000,
  episodesCompleted: 3000,
  topSeries: [
    { seriesId: 'b', title: 'B', viewers: 200, completions: 50 },
    {
      seriesId: 'a',
      title: 'Un titre de série particulièrement long pour l’axe',
      viewers: 500,
      completions: 400,
    },
    { seriesId: 'c', title: 'C', viewers: 200, completions: 120 },
    { seriesId: 'z', title: 'Z', viewers: 0, completions: 0 },
  ],
  generatedAt: '2026-10-29T12:00:00.000Z',
}

async function signIn(): Promise<void> {
  const auth = useAuthStore()
  auth.clearSession()
  await auth.login(mockCredentials.email, mockCredentials.password)
  await auth.verifyTotp(mockCredentials.totpCode)
}

describe('stats helpers (B-11) — ratios with zero guards', () => {
  it('computes a completion rate clamped to [0, 1] and null without starts', () => {
    expect(completionRate(4000, 3000)).toBe(0.75)
    expect(completionRate(0, 0)).toBeNull()
    expect(completionRate(0, 10)).toBeNull()
    expect(completionRate(-5, 1)).toBeNull()
    expect(completionRate(10, 50)).toBe(1)
    expect(completionRate(10, -3)).toBe(0)
    expect(completionRate(Number.NaN, 1)).toBeNull()
    expect(completionRate(Number.POSITIVE_INFINITY, 1)).toBeNull()
  })

  it('computes shares with the same guards', () => {
    expect(share(300, 1200)).toBe(0.25)
    expect(share(0, 0)).toBeNull()
    expect(share(3, 0)).toBeNull()
  })

  it('validates periods and exposes the refresh interval', () => {
    expect(isStatsPeriod(7)).toBe(true)
    expect(isStatsPeriod('30')).toBe(true)
    expect(isStatsPeriod(14)).toBe(false)
    expect(isStatsPeriod(undefined)).toBe(false)
    expect(STATS_REFRESH_INTERVAL_MS).toBe(300_000)
  })
})

describe('stats helpers (B-11) — tile derivation', () => {
  it('derives the nine tiles in order with hints', () => {
    const tiles = deriveTiles(overview)
    expect(tiles.map((tile) => tile.key)).toEqual([
      'activeD1',
      'activeD7',
      'activeD30',
      'newUsers',
      'registeredUsers',
      'guestUsers',
      'episodesStarted',
      'episodesCompleted',
      'completionRate',
    ])
    expect(tiles[0]).toEqual({ key: 'activeD1', value: 120, format: 'count' })
    expect(tiles[4]!.hint).toEqual({ key: 'shareOfUsers', value: 0.25 })
    expect(tiles[5]!.hint).toEqual({ key: 'shareOfUsers', value: 0.75 })
    expect(tiles[7]!.hint).toEqual({ key: 'shareOfStarted', value: 0.75 })
    expect(tiles[8]).toEqual({ key: 'completionRate', value: 0.75, format: 'percent' })
  })

  it('keeps the rate undefined (not NaN) on an empty overview', () => {
    const empty: StatsOverview = {
      activeUsers: { d1: 0, d7: 0, d30: 0 },
      newUsers: 0,
      registeredUsers: 0,
      guestUsers: 0,
      episodesStarted: 0,
      episodesCompleted: 0,
      topSeries: [],
      generatedAt: '2026-10-29T12:00:00.000Z',
    }
    const tiles = deriveTiles(empty)
    expect(tiles.find((tile) => tile.key === 'completionRate')!.value).toBeNull()
    expect(tiles.find((tile) => tile.key === 'registeredUsers')!.hint!.value).toBeNull()
    expect(isEmptyOverview(empty)).toBe(true)
    expect(isEmptyOverview(overview)).toBe(false)
    expect(isEmptyOverview(null)).toBe(true)
  })

  it('formats counts and percents in French', () => {
    expect(formatCount(1284).replace(/\s/g, ' ')).toBe('1 284')
    expect(formatCount(12_900)).toMatch(/12,9\s?k/)
    expect(formatCount(4_200_000)).toMatch(/4,2\s?M/)
    expect(formatCount(null)).toBe('—')
    expect(formatPercent(0.754).replace(/\s/g, ' ')).toBe('75 %')
    expect(formatPercent(null)).toBe('—')
  })
})

describe('stats helpers (B-11) — top series', () => {
  it('ranks by viewers then completions, with per-row completion rate', () => {
    const rows = rankTopSeries(overview.topSeries)
    expect(rows.map((row) => row.seriesId)).toEqual(['a', 'c', 'b', 'z'])
    expect(rows.map((row) => row.rank)).toEqual([1, 2, 3, 4])
    expect(rows[0]!.completionRate).toBe(0.8)
    expect(rows[3]!.completionRate).toBeNull()
    expect(rankTopSeries(overview.topSeries, 2)).toHaveLength(2)
  })

  it('builds two fixed-colour datasets and truncates long labels', () => {
    const chart = topSeriesChartData(rankTopSeries(overview.topSeries))
    expect(chart.datasets.map((dataset) => dataset.key)).toEqual(['viewers', 'completions'])
    expect(chart.datasets[0]!.backgroundColor).toBe(STATS_SERIES_COLORS.viewers)
    expect(chart.datasets[1]!.backgroundColor).toBe(STATS_SERIES_COLORS.completions)
    expect(chart.datasets[0]!.data).toEqual([500, 200, 200, 0])
    expect(chart.labels[0]!.length).toBeLessThanOrEqual(28)
    expect(chart.labels[0]!.endsWith('…')).toBe(true)
    expect(chart.labels[1]).toBe('C')
    expect(topSeriesChartData([])).toEqual({
      labels: [],
      datasets: [
        { key: 'viewers', data: [], backgroundColor: STATS_SERIES_COLORS.viewers },
        { key: 'completions', data: [], backgroundColor: STATS_SERIES_COLORS.completions },
      ],
    })
  })
})

describe('mock admin API — stats overview (B-11)', () => {
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

  it('serves the contract shape for 7 and 30 days and rejects other periods', async () => {
    const api = useStatsApi()
    await expect(api.overview(7)).rejects.toMatchObject({ status: 401 })

    await signIn()
    const week = await api.overview(7)
    expect(week).toMatchObject({
      activeUsers: { d1: expect.any(Number), d7: expect.any(Number), d30: expect.any(Number) },
      newUsers: expect.any(Number),
      registeredUsers: expect.any(Number),
      guestUsers: expect.any(Number),
      episodesStarted: expect.any(Number),
      episodesCompleted: expect.any(Number),
      generatedAt: expect.any(String),
    })
    expect(week.topSeries[0]).toMatchObject({
      seriesId: expect.any(String),
      title: expect.any(String),
      viewers: expect.any(Number),
      completions: expect.any(Number),
    })
    expect(completionRate(week.episodesStarted, week.episodesCompleted)).toBeGreaterThan(0)

    const month = await api.overview(30)
    expect(month.newUsers).toBeGreaterThan(week.newUsers)
    expect(month.episodesStarted).toBeGreaterThan(week.episodesStarted)
    expect(Date.parse(month.generatedAt)).not.toBeNaN()

    await expect(
      useApi().get('/admin/stats/overview', { query: { days: 14 } }),
    ).rejects.toMatchObject({ status: 400 })
  })
})

describe('stats — revenue by source (B-11, sprint 9)', () => {
  it('sorts rows by source then currency', () => {
    const rows: StatsRevenueBySource[] = [
      { source: 'MOBILE_MONEY', currency: 'XOF', amountMinor: 1000, orderCount: 1 },
      { source: 'GOOGLE_PLAY', currency: 'EUR', amountMinor: 500, orderCount: 2 },
      { source: 'GOOGLE_PLAY', currency: 'USD', amountMinor: 300, orderCount: 1 },
    ]
    expect(sortRevenueRows(rows).map((r) => `${r.source}-${r.currency}`)).toEqual([
      'GOOGLE_PLAY-EUR',
      'GOOGLE_PLAY-USD',
      'MOBILE_MONEY-XOF',
    ])
  })

  it('formats a known currency through formatPrice and falls back for an unknown one', () => {
    expect(
      formatRevenueAmount(
        { source: 'MOBILE_MONEY', currency: 'XOF', amountMinor: 1500, orderCount: 1 },
        'fr',
      ),
    ).toMatch(/1\s?500/)
    // GBP is not in the app's known Currency union: falls back to a generic Intl format (cents).
    expect(
      formatRevenueAmount(
        { source: 'GOOGLE_PLAY', currency: 'GBP', amountMinor: 12345, orderCount: 1 },
        'en-US',
      ),
    ).toMatch(/123\.45/)
  })
})

describe('stats — paywall conversion (B-11, sprint 9)', () => {
  it('conversion rate is null without any paywall views, not zero', () => {
    const view = deriveConversionView({ ...overview, paywallConversion: undefined })
    expect(view.conversionRate).toBeNull()
    expect(view.paywallViewers).toBe(0)
  })

  it('exposes the backend ratio and window when present', () => {
    const view = deriveConversionView({
      ...overview,
      paywallConversion: {
        paywallViewers: 200,
        convertedViewers: 50,
        conversionRate: 0.25,
        windowHours: 24,
      },
    })
    expect(view).toEqual({
      conversionRate: 0.25,
      paywallViewers: 200,
      convertedViewers: 50,
      windowHours: 24,
    })
  })

  it('a conversionRate of 0 with real viewers is kept as 0, not null', () => {
    const view = deriveConversionView({
      ...overview,
      paywallConversion: {
        paywallViewers: 10,
        convertedViewers: 0,
        conversionRate: 0,
        windowHours: 24,
      },
    })
    expect(view.conversionRate).toBe(0)
  })
})

describe('stats — retention per episode (B-11, sprint 9)', () => {
  it('sorts points by episode number and extracts parallel arrays', () => {
    const data = retentionChartData([
      { episodeNumber: 2, viewers: 40, retentionPercent: 40 },
      { episodeNumber: 1, viewers: 100, retentionPercent: 100 },
      { episodeNumber: 3, viewers: 20, retentionPercent: 20 },
    ])
    expect(data.episodeNumbers).toEqual([1, 2, 3])
    expect(data.viewers).toEqual([100, 40, 20])
    expect(data.retentionPercent).toEqual([100, 40, 20])
  })

  it('an empty curve yields empty arrays', () => {
    expect(retentionChartData([])).toEqual({
      episodeNumbers: [],
      retentionPercent: [],
      viewers: [],
    })
  })
})
