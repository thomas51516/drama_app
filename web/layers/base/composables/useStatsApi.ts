import type { StatsOverview, StatsPeriod } from '../types/api'
import { useApi } from './useApi'

/** Typed wrapper over `GET /admin/stats/overview?days=7|30` (B-11 v0, public contract v1.2). */
export function useStatsApi() {
  const api = useApi()

  return {
    isMock: api.isMock,
    overview: (days: StatsPeriod, signal?: AbortSignal) =>
      api.get<StatsOverview>('/admin/stats/overview', { query: { days }, signal }),
  }
}

export type StatsApi = ReturnType<typeof useStatsApi>
