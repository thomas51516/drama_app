import type {
  AdminEpisode,
  AdminEpisodeCreateInput,
  AdminEpisodeUpdateInput,
  AdminSeries,
  AdminSeriesInput,
  AdminSeriesListQuery,
  EpisodeUploadUrlRequest,
  EpisodeUploadUrlResponse,
  Paginated,
  PresignRequest,
  PresignResponse,
} from '../types/api'
import { useApi } from './useApi'

/**
 * Typed wrappers over the catalogue endpoints of docs/api/admin-contract-v1.md (B-01, B-02).
 * Pages and components call these instead of building paths by hand.
 */
export function useCatalogueApi() {
  const api = useApi()
  const encode = encodeURIComponent

  return {
    isMock: api.isMock,

    // --- series (B-01) ----------------------------------------------------
    listSeries: (query: AdminSeriesListQuery = {}, signal?: AbortSignal) =>
      api.get<Paginated<AdminSeries>>('/admin/series', {
        query: {
          page: query.page,
          pageSize: query.pageSize,
          status: query.status,
          q: query.q?.trim() || undefined,
        },
        signal,
      }),
    getSeries: (id: string) => api.get<AdminSeries>(`/admin/series/${encode(id)}`),
    createSeries: (input: Partial<AdminSeriesInput>) =>
      api.post<AdminSeries>('/admin/series', input),
    updateSeries: (id: string, input: Partial<AdminSeriesInput>) =>
      api.patch<AdminSeries>(`/admin/series/${encode(id)}`, input),
    publishSeries: (id: string) => api.post<AdminSeries>(`/admin/series/${encode(id)}/publish`),
    archiveSeries: (id: string) => api.post<AdminSeries>(`/admin/series/${encode(id)}/archive`),
    presignPoster: (input: Omit<PresignRequest, 'kind'>) =>
      api.post<PresignResponse>('/admin/uploads/presign', { kind: 'poster', ...input }),

    // --- episodes (B-02) --------------------------------------------------
    listEpisodes: (seriesId: string, signal?: AbortSignal) =>
      api.get<AdminEpisode[]>(`/admin/series/${encode(seriesId)}/episodes`, { signal }),
    createEpisode: (seriesId: string, input: AdminEpisodeCreateInput, signal?: AbortSignal) =>
      api.post<AdminEpisode>(`/admin/series/${encode(seriesId)}/episodes`, input, { signal }),
    updateEpisode: (id: string, input: AdminEpisodeUpdateInput) =>
      api.patch<AdminEpisode>(`/admin/episodes/${encode(id)}`, input),
    deleteEpisode: (id: string) => api.delete<null>(`/admin/episodes/${encode(id)}`),
    reorderEpisodes: (seriesId: string, episodeIds: string[]) =>
      api.put<AdminEpisode[]>(`/admin/series/${encode(seriesId)}/episodes/order`, { episodeIds }),
    requestUploadUrl: (id: string, input: EpisodeUploadUrlRequest, signal?: AbortSignal) =>
      api.post<EpisodeUploadUrlResponse>(`/admin/episodes/${encode(id)}/upload-url`, input, {
        signal,
      }),
    markUploaded: (id: string, signal?: AbortSignal) =>
      api.post<AdminEpisode>(`/admin/episodes/${encode(id)}/uploaded`, undefined, { signal }),
    retranscodeEpisode: (id: string) =>
      api.post<AdminEpisode>(`/admin/episodes/${encode(id)}/retranscode`),
  }
}

export type CatalogueApi = ReturnType<typeof useCatalogueApi>
