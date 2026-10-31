import type { StatsOverview, StatsPeriod, StatsRetention } from '../types/api'
import { useApi } from './useApi'

/** Typed wrapper over `GET /admin/stats/overview?days` and `/admin/stats/retention` (B-11). */
export function useStatsApi() {
  const api = useApi()

  return {
    isMock: api.isMock,
    overview: (days: StatsPeriod, signal?: AbortSignal) =>
      api.get<StatsOverview>('/admin/stats/overview', { query: { days }, signal }),
    /** `seriesId` omitted = cohorts of the whole catalogue, combined series by series. */
    retention: (seriesId?: string, signal?: AbortSignal) =>
      api.get<StatsRetention>('/admin/stats/retention', { query: { seriesId }, signal }),
  }
}

export type StatsApi = ReturnType<typeof useStatsApi>
