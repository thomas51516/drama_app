import type { StatsOverview, StatsPeriod, StatsTopSeries } from '../types/api'
import { STATS_PERIODS } from '../types/api'

/**
 * Dashboard v0 helpers (B-11). Pure derivations of `GET /admin/stats/overview`; the page only
 * formats and renders. Every ratio guards against zero and returns `null` when undefined.
 */

/** The dashboard refreshes itself every 5 minutes (same horizon as the backend cache). */
export const STATS_REFRESH_INTERVAL_MS = 5 * 60 * 1000

/** Validated categorical palette (dataviz skill, slots 1 and 2, light surface). */
export const STATS_SERIES_COLORS = {
  viewers: '#2a78d6',
  completions: '#eb6834',
} as const

export function isStatsPeriod(value: unknown): value is StatsPeriod {
  return (STATS_PERIODS as readonly number[]).includes(Number(value))
}

/** `completed / started` in [0, 1], or `null` when nothing was started (never NaN / Infinity). */
export function completionRate(started: number, completed: number): number | null {
  if (!Number.isFinite(started) || !Number.isFinite(completed) || started <= 0) return null
  return Math.min(1, Math.max(0, completed / started))
}

/** Share of `part` in `total`, `null` when the total is zero. */
export function share(part: number, total: number): number | null {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return null
  return Math.min(1, Math.max(0, part / total))
}

export type StatTileKey =
  | 'activeD1'
  | 'activeD7'
  | 'activeD30'
  | 'newUsers'
  | 'registeredUsers'
  | 'guestUsers'
  | 'episodesStarted'
  | 'episodesCompleted'
  | 'completionRate'

export interface StatTile {
  key: StatTileKey
  /** Raw value (count or ratio in [0, 1]); `null` when undefined (e.g. rate without starts). */
  value: number | null
  format: 'count' | 'percent'
  /** Optional secondary ratio shown under the value (e.g. registered share), in [0, 1]. */
  hint?: { key: 'shareOfUsers' | 'shareOfStarted'; value: number | null }
}

/** The KPI row of the dashboard, in display order. */
export function deriveTiles(overview: StatsOverview): StatTile[] {
  const totalUsers = overview.registeredUsers + overview.guestUsers
  return [
    { key: 'activeD1', value: overview.activeUsers.d1, format: 'count' },
    { key: 'activeD7', value: overview.activeUsers.d7, format: 'count' },
    { key: 'activeD30', value: overview.activeUsers.d30, format: 'count' },
    { key: 'newUsers', value: overview.newUsers, format: 'count' },
    {
      key: 'registeredUsers',
      value: overview.registeredUsers,
      format: 'count',
      hint: { key: 'shareOfUsers', value: share(overview.registeredUsers, totalUsers) },
    },
    {
      key: 'guestUsers',
      value: overview.guestUsers,
      format: 'count',
      hint: { key: 'shareOfUsers', value: share(overview.guestUsers, totalUsers) },
    },
    { key: 'episodesStarted', value: overview.episodesStarted, format: 'count' },
    {
      key: 'episodesCompleted',
      value: overview.episodesCompleted,
      format: 'count',
      hint: {
        key: 'shareOfStarted',
        value: completionRate(overview.episodesStarted, overview.episodesCompleted),
      },
    },
    {
      key: 'completionRate',
      value: completionRate(overview.episodesStarted, overview.episodesCompleted),
      format: 'percent',
    },
  ]
}

export interface TopSeriesRow extends StatsTopSeries {
  rank: number
  /** `completions / viewers`, `null` without viewers. */
  completionRate: number | null
}

/** Top series sorted by viewers (ties by completions), ranked, capped to `limit`. */
export function rankTopSeries(topSeries: readonly StatsTopSeries[], limit = 10): TopSeriesRow[] {
  return [...topSeries]
    .filter((row) => Number.isFinite(row.viewers) && Number.isFinite(row.completions))
    .sort((a, b) => b.viewers - a.viewers || b.completions - a.completions)
    .slice(0, limit)
    .map((row, index) => ({
      ...row,
      rank: index + 1,
      completionRate: completionRate(row.viewers, row.completions),
    }))
}

export interface TopSeriesChartData {
  labels: string[]
  datasets: {
    key: 'viewers' | 'completions'
    data: number[]
    backgroundColor: string
  }[]
}

/**
 * Data of the horizontal grouped bar (two series: viewers, completions). Labels are the series
 * titles (truncated for the axis; the table keeps the full title). Empty when nothing to show.
 */
export function topSeriesChartData(
  rows: readonly TopSeriesRow[],
  maxLabel = 28,
): TopSeriesChartData {
  return {
    labels: rows.map((row) =>
      row.title.length > maxLabel ? `${row.title.slice(0, maxLabel - 1).trimEnd()}…` : row.title,
    ),
    datasets: [
      {
        key: 'viewers',
        data: rows.map((row) => row.viewers),
        backgroundColor: STATS_SERIES_COLORS.viewers,
      },
      {
        key: 'completions',
        data: rows.map((row) => row.completions),
        backgroundColor: STATS_SERIES_COLORS.completions,
      },
    ],
  }
}

/** Compact count (`1 284`, `12,9 k`, `4,2 M`) in the given locale; `—` when null. */
export function formatCount(value: number | null | undefined, locale = 'fr-FR'): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  const abs = Math.abs(value)
  if (abs < 10_000) return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value)
  return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(
    value,
  )
}

/** Ratio in [0, 1] → `42 %`; `—` when null. */
export function formatPercent(value: number | null | undefined, locale = 'fr-FR'): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(value)
}

/** True when the overview has no activity at all (empty state of the dashboard). */
export function isEmptyOverview(overview: StatsOverview | null | undefined): boolean {
  if (!overview) return true
  return (
    overview.activeUsers.d30 === 0 &&
    overview.newUsers === 0 &&
    overview.registeredUsers + overview.guestUsers === 0 &&
    overview.episodesStarted === 0 &&
    overview.topSeries.length === 0
  )
}
