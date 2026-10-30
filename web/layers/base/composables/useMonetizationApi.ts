import type {
  CheckinScale,
  CoinPackAdmin,
  CoinPackInput,
  MonetizationOrderInput,
  MonetizationSettings,
  VipPlanAdmin,
  VipPlanInput,
} from '../types/api'
import { useApi } from './useApi'

/** The list endpoints may answer `[]` or `{ items }`: accept both. */
function asList<T>(raw: T[] | { items: T[] } | null | undefined): T[] {
  return Array.isArray(raw) ? raw : (raw?.items ?? [])
}

/**
 * Typed wrappers over the monetization (B-06) and rewards (B-08) endpoints of contract v1.4
 * (MONETIZATION and ADMIN; every mutation is audited by the backend).
 */
export function useMonetizationApi() {
  const api = useApi()
  const encode = encodeURIComponent

  return {
    isMock: api.isMock,

    // --- settings ---------------------------------------------------------
    getSettings: (signal?: AbortSignal) =>
      api.get<MonetizationSettings>('/admin/monetization/settings', { signal }),
    updateSettings: (input: MonetizationSettings) =>
      api.put<MonetizationSettings>('/admin/monetization/settings', input),

    // --- coin packs -------------------------------------------------------
    listPacks: async (signal?: AbortSignal) =>
      asList(
        await api.get<CoinPackAdmin[] | { items: CoinPackAdmin[] }>('/admin/monetization/packs', {
          signal,
        }),
      ),
    createPack: (input: CoinPackInput) =>
      api.post<CoinPackAdmin>('/admin/monetization/packs', input),
    updatePack: (id: string, input: CoinPackInput) =>
      api.patch<CoinPackAdmin>(`/admin/monetization/packs/${encode(id)}`, input),
    deletePack: (id: string) => api.delete<null>(`/admin/monetization/packs/${encode(id)}`),
    reorderPacks: async (ids: string[]) =>
      asList(
        await api.put<CoinPackAdmin[] | { items: CoinPackAdmin[] }>(
          '/admin/monetization/packs/order',
          { ids } satisfies MonetizationOrderInput,
        ),
      ),

    // --- VIP plans --------------------------------------------------------
    listVipPlans: async (signal?: AbortSignal) =>
      asList(
        await api.get<VipPlanAdmin[] | { items: VipPlanAdmin[] }>('/admin/monetization/vip-plans', {
          signal,
        }),
      ),
    createVipPlan: (input: VipPlanInput) =>
      api.post<VipPlanAdmin>('/admin/monetization/vip-plans', input),
    updateVipPlan: (id: string, input: VipPlanInput) =>
      api.patch<VipPlanAdmin>(`/admin/monetization/vip-plans/${encode(id)}`, input),
    deleteVipPlan: (id: string) => api.delete<null>(`/admin/monetization/vip-plans/${encode(id)}`),

    // --- rewards (B-08) ---------------------------------------------------
    getCheckinScale: (signal?: AbortSignal) =>
      api.get<CheckinScale>('/admin/rewards/checkin', { signal }),
    updateCheckinScale: (input: CheckinScale) =>
      api.put<CheckinScale>('/admin/rewards/checkin', input),
  }
}

export type MonetizationApi = ReturnType<typeof useMonetizationApi>
