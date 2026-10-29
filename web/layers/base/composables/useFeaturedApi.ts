import type {
  HomeBanner,
  HomeBannerInput,
  HomePreviewQuery,
  HomeRow,
  HomeRowInput,
  PublicHomeResponse,
} from '../types/api'
import { useApi } from './useApi'

/** Typed wrappers over the home curation endpoints of the addendum v1.1 (B-05). */
export function useFeaturedApi() {
  const api = useApi()
  const encode = encodeURIComponent

  return {
    isMock: api.isMock,

    // --- banners ----------------------------------------------------------
    listBanners: (signal?: AbortSignal) => api.get<HomeBanner[]>('/admin/home/banners', { signal }),
    createBanner: (input: HomeBannerInput) => api.post<HomeBanner>('/admin/home/banners', input),
    updateBanner: (id: string, input: HomeBannerInput) =>
      api.patch<HomeBanner>(`/admin/home/banners/${encode(id)}`, input),
    deleteBanner: (id: string) => api.delete<null>(`/admin/home/banners/${encode(id)}`),
    reorderBanners: (ids: string[]) => api.put<HomeBanner[]>('/admin/home/banners/order', { ids }),

    // --- rows -------------------------------------------------------------
    listRows: (signal?: AbortSignal) => api.get<HomeRow[]>('/admin/home/rows', { signal }),
    createRow: (input: HomeRowInput) => api.post<HomeRow>('/admin/home/rows', input),
    updateRow: (id: string, input: HomeRowInput) =>
      api.patch<HomeRow>(`/admin/home/rows/${encode(id)}`, input),
    deleteRow: (id: string) => api.delete<null>(`/admin/home/rows/${encode(id)}`),
    reorderRows: (ids: string[]) => api.put<HomeRow[]>('/admin/home/rows/order', { ids }),

    // --- preview ----------------------------------------------------------
    preview: (query: HomePreviewQuery, signal?: AbortSignal) =>
      api.get<PublicHomeResponse>('/admin/home/preview', {
        query: { country: query.country, lang: query.lang },
        signal,
      }),
  }
}

export type FeaturedApi = ReturnType<typeof useFeaturedApi>
