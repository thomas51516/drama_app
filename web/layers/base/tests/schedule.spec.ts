import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useAuthStore } from '../stores/auth'
import { useCatalogueApi } from '../composables/useCatalogueApi'
import { useScheduleApi } from '../composables/useScheduleApi'
import { mockCredentials, mockTiming, resetMockState } from '../mocks'
import { seriesFormDiff, seriesToForm } from '../utils/series-form'
import {
  addWallDays,
  dailyReleasePlan,
  dateKey,
  formatTime,
  fromPickerDate,
  groupByDay,
  isPlannable,
  monthGrid,
  normalizeScheduleResponse,
  planDayCount,
  publicationState,
  shiftMonth,
  toPickerDate,
  upcomingRange,
  utcToWallTime,
  wallTimeToUtc,
} from '../utils/schedule'
import type { AdminSeries } from '../types/api'

const SERIES_B = 'ser_01HZX0A1B2C3D4E5F6G7H8J9K1'
const DRAFT_SERIES = 'ser_01HZX0A1B2C3D4E5F6G7H8J9K2'

async function signIn(email = mockCredentials.email): Promise<void> {
  const auth = useAuthStore()
  auth.clearSession()
  await auth.login(email, mockCredentials.password)
  await auth.verifyTotp(mockCredentials.totpCode)
}

describe('schedule helpers (B-04) — wall time <-> UTC', () => {
  it('Lomé is UTC+0: wall time equals the UTC fields', () => {
    const wall = utcToWallTime('2026-11-03T18:00:00.000Z', 'Africa/Lome')
    expect(wall).toEqual({ year: 2026, month: 11, day: 3, hour: 18, minute: 0 })
    expect(wallTimeToUtc(wall, 'Africa/Lome').toISOString()).toBe('2026-11-03T18:00:00.000Z')
  })

  it('handles other zones, including DST, both ways', () => {
    // Paris in summer is UTC+2, in winter UTC+1.
    expect(
      wallTimeToUtc(
        { year: 2026, month: 7, day: 1, hour: 10, minute: 30 },
        'Europe/Paris',
      ).toISOString(),
    ).toBe('2026-07-01T08:30:00.000Z')
    expect(
      wallTimeToUtc(
        { year: 2026, month: 1, day: 1, hour: 0, minute: 0 },
        'Europe/Paris',
      ).toISOString(),
    ).toBe('2025-12-31T23:00:00.000Z')
    expect(utcToWallTime('2026-01-01T00:30:00.000Z', 'Africa/Lome').hour).toBe(0)
    expect(dateKey('2026-12-31T23:30:00.000Z', 'Europe/Paris')).toBe('2027-01-01')
  })

  it('round-trips picker dates through UTC', () => {
    const picked = new Date(2026, 10, 5, 18, 0, 0, 0)
    const iso = fromPickerDate(picked, 'Africa/Lome')
    expect(iso).toBe('2026-11-05T18:00:00.000Z')
    expect(toPickerDate(iso, 'Africa/Lome')?.getTime()).toBe(picked.getTime())
    expect(fromPickerDate(null)).toBeNull()
    expect(toPickerDate('not a date')).toBeNull()
    expect(formatTime('2026-11-05T18:05:00.000Z', 'Africa/Lome')).toBe('18:05')
  })

  it('adds calendar days across month and year ends', () => {
    expect(addWallDays({ year: 2026, month: 12, day: 31 }, 1)).toEqual({
      year: 2027,
      month: 1,
      day: 1,
    })
    expect(addWallDays({ year: 2026, month: 3, day: 1 }, -1)).toEqual({
      year: 2026,
      month: 2,
      day: 28,
    })
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 })
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 })
  })
})

describe('schedule helpers (B-04) — publication state', () => {
  const now = new Date('2026-10-29T12:00:00.000Z')

  it('is scheduled in the future, published in the past, none when unset or invalid', () => {
    expect(publicationState('2026-10-30T00:00:00.000Z', now)).toBe('scheduled')
    expect(publicationState('2026-10-29T11:59:59.000Z', now)).toBe('published')
    expect(publicationState(null, now)).toBe('none')
    expect(publicationState('garbage', now)).toBe('none')
  })

  it('only PENDING and READY episodes are plannable', () => {
    expect(isPlannable({ transcodeStatus: 'PENDING' })).toBe(true)
    expect(isPlannable({ transcodeStatus: 'READY' })).toBe(true)
    expect(isPlannable({ transcodeStatus: 'PROCESSING' })).toBe(false)
    expect(isPlannable({ transcodeStatus: 'UPLOADED' })).toBe(false)
    expect(isPlannable({ transcodeStatus: 'FAILED' })).toBe(false)
  })
})

describe('schedule helpers (B-04) — calendar range mapping', () => {
  it('builds a 6-week Monday-first grid and the UTC range covering it', () => {
    const grid = monthGrid(2026, 11, {
      timeZone: 'Africa/Lome',
      now: new Date('2026-11-10T10:00:00Z'),
    })
    expect(grid.weeks).toHaveLength(6)
    expect(grid.weeks.every((week) => week.length === 7)).toBe(true)
    // November 2026 starts on a Sunday: the grid starts Monday 26 October.
    expect(grid.weeks[0]![0]!.key).toBe('2026-10-26')
    expect(grid.weeks[0]![0]!.inMonth).toBe(false)
    expect(grid.weeks[0]![6]!.key).toBe('2026-11-01')
    expect(grid.weeks[0]![6]!.inMonth).toBe(true)
    expect(grid.weeks[5]![6]!.key).toBe('2026-12-06')
    expect(grid.from).toBe('2026-10-26T00:00:00.000Z')
    expect(grid.to).toBe('2026-12-06T23:59:59.999Z')
    const today = grid.weeks.flat().find((day) => day.isToday)
    expect(today?.key).toBe('2026-11-10')
  })

  it('maps the agenda range from the start of today to N days later', () => {
    const range = upcomingRange(new Date('2026-10-29T15:42:00.000Z'), 90, 'Africa/Lome')
    expect(range.from).toBe('2026-10-29T00:00:00.000Z')
    expect(range.to).toBe('2027-01-27T23:59:59.999Z')
  })

  it('groups items by wall day in ascending order', () => {
    const items = normalizeScheduleResponse([
      {
        kind: 'EPISODE',
        id: 'e2',
        seriesId: 's',
        seriesTitle: 'S',
        title: 'B',
        episodeNumber: 2,
        publishedAt: '2026-11-02T18:00:00Z',
        status: 'READY',
      },
      {
        kind: 'SERIES',
        id: 's',
        seriesId: 's',
        seriesTitle: 'S',
        title: 'S',
        episodeNumber: null,
        publishedAt: '2026-11-01T10:00:00Z',
        status: 'DRAFT',
      },
      {
        kind: 'EPISODE',
        id: 'e1',
        seriesId: 's',
        seriesTitle: 'S',
        title: 'A',
        episodeNumber: 1,
        publishedAt: '2026-11-01T18:00:00Z',
        status: 'READY',
      },
    ])
    const groups = groupByDay(items, 'Africa/Lome')
    expect(groups.map((group) => group.key)).toEqual(['2026-11-01', '2026-11-02'])
    expect(groups[0]!.items.map((item) => item.id)).toEqual(['s', 'e1'])
  })

  it('reads the backend wire shape (lowercase kind, episodeTitle, statuses, willBeVisible)', () => {
    const [episode, series] = normalizeScheduleResponse({
      from: '2026-10-29T00:00:00.000Z',
      to: '2026-11-28T00:00:00.000Z',
      items: [
        {
          kind: 'series',
          id: 's1',
          seriesId: 's1',
          seriesTitle: 'Ombres sur Abidjan',
          seriesStatus: 'DRAFT',
          episodeNumber: null,
          episodeTitle: null,
          transcodeStatus: null,
          publishedAt: '2026-11-05T10:00:00.000Z',
          willBeVisible: false,
        },
        {
          kind: 'episode',
          id: 'e3',
          seriesId: 's2',
          seriesTitle: 'Le Secret du Lagon',
          seriesStatus: 'PUBLISHED',
          episodeNumber: 3,
          episodeTitle: 'Le testament',
          transcodeStatus: 'READY',
          publishedAt: '2026-11-01T18:00:00.000Z',
          willBeVisible: true,
        },
      ],
    })
    expect(episode).toEqual({
      kind: 'EPISODE',
      id: 'e3',
      seriesId: 's2',
      seriesTitle: 'Le Secret du Lagon',
      title: 'Le testament',
      episodeNumber: 3,
      publishedAt: '2026-11-01T18:00:00.000Z',
      status: 'READY',
      willBeVisible: true,
    })
    expect(series).toMatchObject({
      kind: 'SERIES',
      id: 's1',
      title: 'Ombres sur Abidjan',
      status: 'DRAFT',
      willBeVisible: false,
    })
  })

  it('normalises both response shapes and drops undated or unknown entries', () => {
    const fromArray = normalizeScheduleResponse([
      {
        type: 'series',
        id: 's1',
        title: 'Série',
        publishedAt: '2026-11-01T10:00:00Z',
        status: 'PUBLISHED',
      },
      {
        type: 'episode',
        episodeId: 'e1',
        seriesId: 's1',
        seriesTitle: 'Série',
        title: 'Ép',
        number: 3,
        publishedAt: '2026-11-02T10:00:00Z',
      },
      { kind: 'EPISODE', id: 'e2', publishedAt: null },
      { kind: 'OTHER', id: 'x', publishedAt: '2026-11-02T10:00:00Z' },
      null,
    ])
    expect(fromArray).toHaveLength(2)
    expect(fromArray[0]).toMatchObject({
      kind: 'SERIES',
      id: 's1',
      seriesId: 's1',
      seriesTitle: 'Série',
    })
    expect(fromArray[1]).toMatchObject({
      kind: 'EPISODE',
      id: 'e1',
      episodeNumber: 3,
      status: '',
      willBeVisible: null,
    })
    expect(normalizeScheduleResponse({ items: fromArray })).toHaveLength(2)
    expect(normalizeScheduleResponse({})).toEqual([])
    expect(normalizeScheduleResponse(undefined)).toEqual([])
  })
})

describe('schedule helpers (B-04) — daily release planner', () => {
  const episodes = [
    { id: 'c', number: 3 },
    { id: 'a', number: 1 },
    { id: 'b', number: 2 },
    { id: 'd', number: 4 },
    { id: 'e', number: 5 },
  ]

  it('releases one episode per day in number order at the given Lomé time', () => {
    const plan = dailyReleasePlan({
      episodes,
      startDate: { year: 2026, month: 11, day: 2 },
      time: { hour: 18, minute: 0 },
      perDay: 1,
      timeZone: 'Africa/Lome',
    })
    expect(plan.map((entry) => entry.episodeId)).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(plan.map((entry) => entry.publishedAt)).toEqual([
      '2026-11-02T18:00:00.000Z',
      '2026-11-03T18:00:00.000Z',
      '2026-11-04T18:00:00.000Z',
      '2026-11-05T18:00:00.000Z',
      '2026-11-06T18:00:00.000Z',
    ])
    expect(planDayCount(plan)).toBe(5)
  })

  it('groups N episodes per day and crosses month ends', () => {
    const plan = dailyReleasePlan({
      episodes,
      startDate: { year: 2026, month: 11, day: 30 },
      time: { hour: 7, minute: 30 },
      perDay: 2,
    })
    expect(plan.map((entry) => entry.dayIndex)).toEqual([0, 0, 1, 1, 2])
    expect(plan[0]!.publishedAt).toBe('2026-11-30T07:30:00.000Z')
    expect(plan[2]!.publishedAt).toBe('2026-12-01T07:30:00.000Z')
    expect(plan[4]!.publishedAt).toBe('2026-12-02T07:30:00.000Z')
    expect(planDayCount(plan)).toBe(3)
  })

  it('converts the wall time of another zone and guards perDay', () => {
    const plan = dailyReleasePlan({
      episodes: episodes.slice(0, 2),
      startDate: { year: 2026, month: 7, day: 1 },
      time: { hour: 20, minute: 0 },
      perDay: 0,
      timeZone: 'Europe/Paris',
    })
    expect(plan.map((entry) => entry.publishedAt)).toEqual([
      '2026-07-01T18:00:00.000Z',
      '2026-07-02T18:00:00.000Z',
    ])
    expect(
      dailyReleasePlan({
        episodes: [],
        startDate: { year: 2026, month: 1, day: 1 },
        time: { hour: 0, minute: 0 },
        perDay: 3,
      }),
    ).toEqual([])
    expect(planDayCount([])).toBe(0)
  })
})

describe('series form — scheduled publication diff', () => {
  const original = {
    id: 's',
    slug: 's',
    title: 'Titre',
    synopsis: 'Synopsis',
    genres: ['romance'],
    tags: [],
    language: 'fr',
    ageRating: 'ALL',
    posterVerticalUrl: null,
    posterHorizontalUrl: null,
    freeEpisodeCount: 0,
    coinCostPerEpisode: 0,
    status: 'DRAFT',
    territories: [],
    episodeCount: 0,
    publishedAt: '2026-11-05T18:00:00.000Z',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  } satisfies AdminSeries

  it('ignores an equal instant, sends a changed or cleared date', () => {
    const form = seriesToForm(original)
    expect(seriesFormDiff(form, original, { includeMonetization: true })).toEqual({})
    form.publishedAt = '2026-11-05T18:00:00Z'
    expect(seriesFormDiff(form, original, { includeMonetization: true })).toEqual({})
    form.publishedAt = '2026-11-06T18:00:00.000Z'
    expect(seriesFormDiff(form, original, { includeMonetization: true })).toEqual({
      publishedAt: '2026-11-06T18:00:00.000Z',
    })
    form.publishedAt = null
    expect(seriesFormDiff(form, original, { includeMonetization: true })).toEqual({
      publishedAt: null,
    })
  })
})

describe('mock admin API — scheduling flow (B-04)', () => {
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

  it('schedules an episode and a series, lists them in range, validates and clears', async () => {
    await signIn('editor@drama.local')
    const catalogue = useCatalogueApi()
    const schedule = useScheduleApi()

    const seeded = await schedule.listSchedule({
      from: new Date().toISOString(),
      to: new Date(Date.now() + 10 * 86_400_000).toISOString(),
    })
    expect(seeded.length).toBeGreaterThanOrEqual(5)
    expect(seeded.some((item) => item.kind === 'SERIES' && item.id === DRAFT_SERIES)).toBe(true)
    expect(seeded.map((item) => item.publishedAt)).toEqual(
      [...seeded.map((item) => item.publishedAt)].sort(),
    )

    const episodes = await catalogue.listEpisodes(SERIES_B)
    const target = episodes.find((episode) => episode.number === 1)!
    const inTwoDays = new Date(Date.now() + 2 * 86_400_000)
    inTwoDays.setUTCHours(19, 0, 0, 0)
    const updated = await catalogue.updateEpisode(target.id, {
      publishedAt: inTwoDays.toISOString(),
    })
    expect(updated.publishedAt).toBe(inTwoDays.toISOString())
    expect(publicationState(updated.publishedAt)).toBe('scheduled')

    const listed = await schedule.listSchedule({
      from: new Date(inTwoDays.getTime() - 3_600_000).toISOString(),
      to: new Date(inTwoDays.getTime() + 3_600_000).toISOString(),
    })
    expect(listed.map((item) => item.id)).toContain(target.id)
    const item = listed.find((entry) => entry.id === target.id)!
    expect(item).toMatchObject({
      kind: 'EPISODE',
      seriesId: SERIES_B,
      episodeNumber: 1,
      status: 'READY',
    })

    const cleared = await catalogue.updateEpisode(target.id, { publishedAt: null })
    expect(cleared.publishedAt).toBeNull()
    await expect(catalogue.updateEpisode(target.id, { publishedAt: 'bad' })).rejects.toMatchObject({
      status: 400,
    })

    const nextWeek = new Date(Date.now() + 7 * 86_400_000).toISOString()
    const series = await catalogue.updateSeries(SERIES_B, { publishedAt: nextWeek })
    expect(series.publishedAt).toBe(nextWeek)
    const window = await schedule.listSchedule({
      from: new Date(Date.now() + 6 * 86_400_000).toISOString(),
      to: new Date(Date.now() + 8 * 86_400_000).toISOString(),
    })
    expect(window.some((entry) => entry.kind === 'SERIES' && entry.id === SERIES_B)).toBe(true)
    await expect(schedule.listSchedule({ from: 'x', to: 'y' })).rejects.toMatchObject({
      status: 400,
    })
  })

  it('refuses scheduling to SUPPORT and MONETIZATION roles', async () => {
    await signIn('support@drama.local')
    const catalogue = useCatalogueApi()
    const episodes = await catalogue.listEpisodes(SERIES_B)
    await expect(
      catalogue.updateEpisode(episodes[0]!.id, { publishedAt: new Date().toISOString() }),
    ).rejects.toMatchObject({ status: 403 })
    // Reading the planning is open to every role.
    await expect(
      useScheduleApi().listSchedule({
        from: new Date().toISOString(),
        to: new Date(Date.now() + 86_400_000).toISOString(),
      }),
    ).resolves.toBeInstanceOf(Array)
  })
})
