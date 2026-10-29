import type { Subtitle } from '../types/api'
import { useApi } from './useApi'

/**
 * Typed wrappers over the subtitle endpoints of the addendum v1.1 (B-03).
 * The upload is a multipart form (`file` + `language`) sent to the API, unlike videos and
 * posters which go straight to the storage: subtitle files are small (2 MB max) and the
 * server converts SRT to VTT.
 */
export function useSubtitlesApi() {
  const api = useApi()
  const encode = encodeURIComponent

  return {
    isMock: api.isMock,
    listSubtitles: (episodeId: string, signal?: AbortSignal) =>
      api.get<Subtitle[]>(`/admin/episodes/${encode(episodeId)}/subtitles`, { signal }),
    uploadSubtitle: (episodeId: string, file: File, language: string, signal?: AbortSignal) => {
      const form = new FormData()
      form.append('file', file, file.name)
      form.append('language', language)
      return api.post<Subtitle>(`/admin/episodes/${encode(episodeId)}/subtitles`, form, {
        signal,
      })
    },
    deleteSubtitle: (id: string) => api.delete<null>(`/admin/subtitles/${encode(id)}`),
  }
}

export type SubtitlesApi = ReturnType<typeof useSubtitlesApi>
