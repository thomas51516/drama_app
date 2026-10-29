import type { ScheduleItem, ScheduleQuery } from '../types/api'
import { normalizeScheduleResponse } from '../utils/schedule'
import { useApi } from './useApi'

/**
 * Typed wrapper over `GET /admin/schedule?from&to` (B-04, public contract v1.2). The response is
 * normalised so the pages always get a sorted `ScheduleItem[]` whatever the exact body shape.
 */
export function useScheduleApi() {
  const api = useApi()

  return {
    isMock: api.isMock,
    listSchedule: async (query: ScheduleQuery, signal?: AbortSignal): Promise<ScheduleItem[]> =>
      normalizeScheduleResponse(
        await api.get<unknown>('/admin/schedule', {
          query: { from: query.from, to: query.to },
          signal,
        }),
      ),
  }
}

export type ScheduleApi = ReturnType<typeof useScheduleApi>
