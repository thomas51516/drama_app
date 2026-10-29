import type { AdminEpisode, ScheduleItem, ScheduleItemKind } from '../types/api'
import { SCHEDULE_TIME_ZONE } from '../types/api'

/**
 * Scheduling helpers (B-04). Pure functions: the API stores UTC instants, the editorial team
 * thinks in Lomé wall-clock time (`Africa/Lome`, UTC+0 all year, but the conversions below are
 * generic so the time zone can change without touching the pages).
 */

// ---------------------------------------------------------------------------
// Wall-clock time <-> UTC
// ---------------------------------------------------------------------------

/** Calendar fields as read on a wall clock in a given time zone (`month` is 1-12). */
export interface WallTime {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

export type WallDate = Pick<WallTime, 'year' | 'month' | 'day'>

const formatterCache = new Map<string, Intl.DateTimeFormat>()

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    formatterCache.set(timeZone, formatter)
  }
  return formatter
}

/** Wall-clock fields of an instant in `timeZone`. */
export function utcToWallTime(
  instant: string | Date,
  timeZone: string = SCHEDULE_TIME_ZONE,
): WallTime {
  const date = typeof instant === 'string' ? new Date(instant) : instant
  const parts = partsFormatter(timeZone).formatToParts(date)
  const read = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? 0)
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    // `hourCycle: 'h23'` makes midnight "00", never "24".
    hour: read('hour') % 24,
    minute: read('minute'),
  }
}

function offsetMinutes(utcMillis: number, timeZone: string): number {
  const wall = utcToWallTime(new Date(utcMillis), timeZone)
  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute)
  const seconds = new Date(utcMillis).getUTCSeconds()
  return Math.round((asUtc - (utcMillis - seconds * 1000)) / 60_000)
}

/** The UTC instant at which a wall clock in `timeZone` shows `wall` (DST-safe, two-pass). */
export function wallTimeToUtc(wall: WallTime, timeZone: string = SCHEDULE_TIME_ZONE): Date {
  const guess = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute)
  let utc = guess - offsetMinutes(guess, timeZone) * 60_000
  // Second pass for instants close to a DST transition.
  utc = guess - offsetMinutes(utc, timeZone) * 60_000
  return new Date(utc)
}

/** `YYYY-MM-DD` of a wall date (used as calendar cell key). */
export function wallDateKey(wall: WallDate): string {
  const mm = String(wall.month).padStart(2, '0')
  const dd = String(wall.day).padStart(2, '0')
  return `${wall.year}-${mm}-${dd}`
}

/** `YYYY-MM-DD` of an instant as seen in `timeZone`. */
export function dateKey(instant: string | Date, timeZone: string = SCHEDULE_TIME_ZONE): string {
  return wallDateKey(utcToWallTime(instant, timeZone))
}

/** Add whole days to a wall date (calendar arithmetic, no time zone involved). */
export function addWallDays(date: WallDate, days: number): WallDate {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days))
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  }
}

/**
 * The PrimeVue DatePicker works with browser-local `Date`s. We treat the fields the user picked
 * as wall-clock time in the schedule time zone, whatever the browser's zone.
 */
export function fromPickerDate(
  date: Date | null | undefined,
  timeZone: string = SCHEDULE_TIME_ZONE,
): string | null {
  if (!date || Number.isNaN(date.getTime())) return null
  return wallTimeToUtc(
    {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      hour: date.getHours(),
      minute: date.getMinutes(),
    },
    timeZone,
  ).toISOString()
}

/** Inverse of `fromPickerDate()`: a local `Date` whose fields show the wall time in `timeZone`. */
export function toPickerDate(
  iso: string | null | undefined,
  timeZone: string = SCHEDULE_TIME_ZONE,
): Date | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  const wall = utcToWallTime(date, timeZone)
  return new Date(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, 0, 0)
}

/** Wall date of "today" in the schedule time zone. */
export function todayWallDate(
  now: Date = new Date(),
  timeZone: string = SCHEDULE_TIME_ZONE,
): WallDate {
  const { year, month, day } = utcToWallTime(now, timeZone)
  return { year, month, day }
}

// ---------------------------------------------------------------------------
// Publication state
// ---------------------------------------------------------------------------

export type PublicationState = 'none' | 'scheduled' | 'published'

/** `scheduled` when the date is in the future, `published` when past, `none` when unset. */
export function publicationState(
  publishedAt: string | null | undefined,
  now: Date = new Date(),
): PublicationState {
  if (!publishedAt) return 'none'
  const time = new Date(publishedAt).getTime()
  if (Number.isNaN(time)) return 'none'
  return time > now.getTime() ? 'scheduled' : 'published'
}

export function isScheduled(
  publishedAt: string | null | undefined,
  now: Date = new Date(),
): boolean {
  return publicationState(publishedAt, now) === 'scheduled'
}

// ---------------------------------------------------------------------------
// Calendar ranges
// ---------------------------------------------------------------------------

export interface CalendarDay {
  /** `YYYY-MM-DD` in the schedule time zone. */
  key: string
  date: WallDate
  /** False for the padding days of the previous/next month. */
  inMonth: boolean
  isToday: boolean
}

export interface MonthGrid {
  year: number
  /** 1-12 */
  month: number
  /** Six weeks of seven days, Monday first. */
  weeks: CalendarDay[][]
  /** ISO bounds (UTC) covering the whole grid, for `GET /admin/schedule?from&to`. */
  from: string
  to: string
}

/** ISO weekday (1 = Monday … 7 = Sunday) of a wall date. */
function isoWeekday(date: WallDate): number {
  const day = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay()
  return day === 0 ? 7 : day
}

/**
 * The calendar grid of a month (always 6 rows so the layout never jumps) and the UTC range to
 * request from the API so every visible cell, padding days included, is covered.
 */
export function monthGrid(
  year: number,
  month: number,
  options: { timeZone?: string; now?: Date } = {},
): MonthGrid {
  const timeZone = options.timeZone ?? SCHEDULE_TIME_ZONE
  const today = wallDateKey(todayWallDate(options.now ?? new Date(), timeZone))
  const first: WallDate = { year, month, day: 1 }
  const start = addWallDays(first, -(isoWeekday(first) - 1))
  const weeks: CalendarDay[][] = []
  for (let week = 0; week < 6; week += 1) {
    const days: CalendarDay[] = []
    for (let weekday = 0; weekday < 7; weekday += 1) {
      const date = addWallDays(start, week * 7 + weekday)
      const key = wallDateKey(date)
      days.push({
        key,
        date,
        inMonth: date.year === year && date.month === month,
        isToday: key === today,
      })
    }
    weeks.push(days)
  }
  const last = addWallDays(start, 6 * 7 - 1)
  return {
    year,
    month,
    weeks,
    from: wallTimeToUtc({ ...start, hour: 0, minute: 0 }, timeZone).toISOString(),
    to: new Date(
      wallTimeToUtc({ ...addWallDays(last, 1), hour: 0, minute: 0 }, timeZone).getTime() - 1,
    ).toISOString(),
  }
}

/** Range of the agenda (list) view: from the start of today (wall clock) to `days` days later. */
export function upcomingRange(
  now: Date = new Date(),
  days = 90,
  timeZone: string = SCHEDULE_TIME_ZONE,
): { from: string; to: string } {
  const today = todayWallDate(now, timeZone)
  return {
    from: wallTimeToUtc({ ...today, hour: 0, minute: 0 }, timeZone).toISOString(),
    to: new Date(
      wallTimeToUtc({ ...addWallDays(today, days + 1), hour: 0, minute: 0 }, timeZone).getTime() -
        1,
    ).toISOString(),
  }
}

/** Previous / next month of a (year, month) pair. */
export function shiftMonth(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const index = year * 12 + (month - 1) + delta
  return { year: Math.floor(index / 12), month: (index % 12) + 1 }
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

function byPublishedAt(a: ScheduleItem, b: ScheduleItem): number {
  return a.publishedAt.localeCompare(b.publishedAt) || a.title.localeCompare(b.title)
}

/** Items sorted by date and grouped by wall day (`YYYY-MM-DD`), days in ascending order. */
export function groupByDay(
  items: readonly ScheduleItem[],
  timeZone: string = SCHEDULE_TIME_ZONE,
): { key: string; items: ScheduleItem[] }[] {
  const groups = new Map<string, ScheduleItem[]>()
  for (const item of [...items].sort(byPublishedAt)) {
    const key = dateKey(item.publishedAt, timeZone)
    const group = groups.get(key)
    if (group) group.push(item)
    else groups.set(key, [item])
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, group]) => ({ key, items: group }))
}

/**
 * Reader of `GET /admin/schedule`. The backend sends `{ items: ScheduleApiItem[] }` (`kind`
 * lowercase, `episodeTitle`, `transcodeStatus` / `seriesStatus`, `willBeVisible`); the reader also
 * accepts a bare array and the generic `type` / `title` / `status` spellings so a contract tweak
 * does not blank the page. Items without a valid publication date are dropped.
 */
export function normalizeScheduleResponse(raw: unknown): ScheduleItem[] {
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { items?: unknown })?.items)
      ? ((raw as { items: unknown[] }).items ?? [])
      : []
  const items: ScheduleItem[] = []
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue
    const record = entry as Record<string, unknown>
    const rawKind = String(record.kind ?? record.type ?? '').toUpperCase()
    const kind: ScheduleItemKind | null =
      rawKind === 'SERIES' ? 'SERIES' : rawKind === 'EPISODE' ? 'EPISODE' : null
    const publishedAt = typeof record.publishedAt === 'string' ? record.publishedAt : null
    if (!kind || !publishedAt || Number.isNaN(new Date(publishedAt).getTime())) continue
    const text = (value: unknown): string | null =>
      typeof value === 'string' && value.length > 0 ? value : null
    const seriesId = text(record.seriesId) ?? (kind === 'SERIES' ? text(record.id) : null) ?? ''
    const id = text(record.id) ?? (kind === 'SERIES' ? seriesId : text(record.episodeId)) ?? ''
    const seriesTitle =
      text(record.seriesTitle) ?? (kind === 'SERIES' ? text(record.title) : null) ?? ''
    const title =
      kind === 'EPISODE'
        ? (text(record.episodeTitle) ?? text(record.title) ?? '')
        : (text(record.title) ?? seriesTitle)
    const number = record.episodeNumber ?? record.number
    const status =
      kind === 'EPISODE'
        ? (text(record.transcodeStatus) ?? text(record.status) ?? '')
        : (text(record.seriesStatus) ?? text(record.status) ?? '')
    items.push({
      kind,
      id,
      seriesId,
      seriesTitle,
      title,
      episodeNumber: kind === 'EPISODE' && typeof number === 'number' ? number : null,
      publishedAt: new Date(publishedAt).toISOString(),
      status,
      willBeVisible: typeof record.willBeVisible === 'boolean' ? record.willBeVisible : null,
    })
  }
  return items.sort(byPublishedAt)
}

// ---------------------------------------------------------------------------
// Daily release planner
// ---------------------------------------------------------------------------

/** Episodes a release plan may schedule: not failed, not being processed. */
export function isPlannable(episode: Pick<AdminEpisode, 'transcodeStatus'>): boolean {
  return episode.transcodeStatus === 'PENDING' || episode.transcodeStatus === 'READY'
}

export interface DailyReleaseOptions {
  episodes: readonly Pick<AdminEpisode, 'id' | 'number'>[]
  /** First release day (wall date in `timeZone`). */
  startDate: WallDate
  /** Release time of every day (wall clock). */
  time: Pick<WallTime, 'hour' | 'minute'>
  /** Episodes released per day (>= 1). */
  perDay: number
  timeZone?: string
}

export interface DailyReleaseEntry {
  episodeId: string
  number: number
  /** 0-based day offset from `startDate`. */
  dayIndex: number
  /** ISO UTC instant to PATCH as `publishedAt`. */
  publishedAt: string
}

/**
 * "Planifier une sortie quotidienne": episodes in number order, `perDay` of them each day from
 * `startDate` at `time`. Episodes sharing a day get the same instant (the app orders by number).
 */
export function dailyReleasePlan(options: DailyReleaseOptions): DailyReleaseEntry[] {
  const perDay = Math.max(1, Math.floor(options.perDay || 1))
  const timeZone = options.timeZone ?? SCHEDULE_TIME_ZONE
  const ordered = [...options.episodes].sort((a, b) => a.number - b.number)
  return ordered.map((episode, index) => {
    const dayIndex = Math.floor(index / perDay)
    const date = addWallDays(options.startDate, dayIndex)
    return {
      episodeId: episode.id,
      number: episode.number,
      dayIndex,
      publishedAt: wallTimeToUtc({ ...date, ...options.time }, timeZone).toISOString(),
    }
  })
}

/** Number of distinct release days of a plan. */
export function planDayCount(plan: readonly DailyReleaseEntry[]): number {
  return plan.length === 0 ? 0 : (plan[plan.length - 1]?.dayIndex ?? 0) + 1
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const displayCache = new Map<string, Intl.DateTimeFormat>()

function displayFormatter(
  locale: string,
  timeZone: string,
  style: 'dateTime' | 'date' | 'time' | 'monthYear',
): Intl.DateTimeFormat {
  const cacheKey = `${locale}|${timeZone}|${style}`
  let formatter = displayCache.get(cacheKey)
  if (!formatter) {
    const options: Intl.DateTimeFormatOptions =
      style === 'dateTime'
        ? { dateStyle: 'medium', timeStyle: 'short' }
        : style === 'date'
          ? { dateStyle: 'full' }
          : style === 'time'
            ? { timeStyle: 'short' }
            : { month: 'long', year: 'numeric' }
    formatter = new Intl.DateTimeFormat(locale, { ...options, timeZone, hourCycle: 'h23' })
    displayCache.set(cacheKey, formatter)
  }
  return formatter
}

/** Human date-time in the schedule time zone (e.g. `3 nov. 2026, 18:00`). */
export function formatZoned(
  iso: string | Date,
  locale = 'fr-FR',
  timeZone: string = SCHEDULE_TIME_ZONE,
  style: 'dateTime' | 'date' | 'time' | 'monthYear' = 'dateTime',
): string {
  const date = typeof iso === 'string' ? new Date(iso) : iso
  if (Number.isNaN(date.getTime())) return '—'
  return displayFormatter(locale, timeZone, style).format(date)
}

/** Full weekday date of a wall date (`lundi 2 novembre 2026`). */
export function formatWallDate(date: WallDate, locale = 'fr-FR'): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeZone: 'UTC' }).format(
    new Date(Date.UTC(date.year, date.month - 1, date.day)),
  )
}

/** Month title of the calendar (`novembre 2026`). */
export function formatMonth(year: number, month: number, locale = 'fr-FR'): string {
  return new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)))
}

/** Short weekday names, Monday first, in the given locale. */
export function weekdayLabels(locale = 'fr-FR'): string[] {
  const formatter = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' })
  // 2024-01-01 is a Monday.
  return Array.from({ length: 7 }, (_, index) =>
    formatter.format(new Date(Date.UTC(2024, 0, 1 + index))),
  )
}

/** `HH:mm` of an instant in the schedule time zone. */
export function formatTime(iso: string, timeZone: string = SCHEDULE_TIME_ZONE): string {
  const wall = utcToWallTime(iso, timeZone)
  return `${String(wall.hour).padStart(2, '0')}:${String(wall.minute).padStart(2, '0')}`
}
