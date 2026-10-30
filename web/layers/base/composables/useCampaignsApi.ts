import type { Campaign, CampaignEstimate, CampaignInput, Paginated } from '../types/api'
import { useApi } from './useApi'

/** The backend pages the list (`{ items, total }`); the contract table says `Campaign`: accept both. */
function normalizeCampaignList(raw: Campaign[] | Paginated<Campaign>): Campaign[] {
  return Array.isArray(raw) ? raw : (raw?.items ?? [])
}

/** Typed wrappers over the push campaign endpoints of contract v1.3 (B-10, MONETIZATION/ADMIN). */
export function useCampaignsApi() {
  const api = useApi()
  const encode = encodeURIComponent

  return {
    isMock: api.isMock,
    /** Every campaign (the MVP has few): one page of 100, newest first. */
    listCampaigns: async (signal?: AbortSignal) =>
      normalizeCampaignList(
        await api.get<Campaign[] | Paginated<Campaign>>('/admin/campaigns', {
          query: { page: 1, pageSize: 100 },
          signal,
        }),
      ),
    getCampaign: (id: string, signal?: AbortSignal) =>
      api.get<Campaign>(`/admin/campaigns/${encode(id)}`, { signal }),
    createCampaign: (input: CampaignInput) => api.post<Campaign>('/admin/campaigns', input),
    updateCampaign: (id: string, input: Partial<CampaignInput>) =>
      api.patch<Campaign>(`/admin/campaigns/${encode(id)}`, input),
    deleteCampaign: (id: string) => api.delete<null>(`/admin/campaigns/${encode(id)}`),
    estimateCampaign: (id: string) =>
      api.post<CampaignEstimate>(`/admin/campaigns/${encode(id)}/estimate`),
    sendCampaign: (id: string) => api.post<Campaign>(`/admin/campaigns/${encode(id)}/send`),
    cancelCampaign: (id: string) => api.post<Campaign>(`/admin/campaigns/${encode(id)}/cancel`),
  }
}

export type CampaignsApi = ReturnType<typeof useCampaignsApi>
