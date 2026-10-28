import { toValue, type MaybeRefOrGetter } from 'vue'
import { episodeContentType } from '../utils/episode-files'
import { mockUploadTransport, xhrUploadTransport } from '../utils/upload-transport'
import {
  createUploadQueue,
  DEFAULT_UPLOAD_CONCURRENCY,
  type UploadItem,
  type UploadQueue,
} from '../utils/upload-queue'
import { useCatalogueApi } from './useCatalogueApi'

export interface EpisodeUploadsOptions {
  concurrency?: number
  onItemDone?: (item: UploadItem) => void
  onItemError?: (item: UploadItem, error: unknown) => void
}

/**
 * Bulk episode upload (B-02) bound to the catalogue API:
 * create episode (title = file name) → upload-url → PUT with progress → POST /uploaded.
 * A retry reuses the episode created on the first attempt and only asks for a fresh upload URL.
 */
export function useEpisodeUploads(
  seriesId: MaybeRefOrGetter<string>,
  options: EpisodeUploadsOptions = {},
): UploadQueue {
  const api = useCatalogueApi()
  const transport = api.isMock ? mockUploadTransport : xhrUploadTransport

  return createUploadQueue(
    {
      async prepare(item, signal) {
        let episodeId = item.episodeId
        if (!episodeId) {
          const episode = await api.createEpisode(toValue(seriesId), { title: item.title }, signal)
          episodeId = episode.id
        }
        const target = await api.requestUploadUrl(
          episodeId,
          {
            fileName: item.file.name,
            contentType: episodeContentType(item.file),
            sizeBytes: item.file.size,
          },
          signal,
        )
        return { episodeId, uploadUrl: target.uploadUrl, headers: target.headers }
      },
      transport,
      async finalize(_item, prepared, signal) {
        await api.markUploaded(prepared.episodeId, signal)
      },
      onItemDone: options.onItemDone,
      onItemError: options.onItemError,
    },
    { concurrency: options.concurrency ?? DEFAULT_UPLOAD_CONCURRENCY },
  )
}
