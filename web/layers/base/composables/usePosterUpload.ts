import { mockUploadTransport, xhrUploadTransport } from '../utils/upload-transport'
import { useCatalogueApi } from './useCatalogueApi'

export const POSTER_MAX_BYTES = 5 * 1024 * 1024
export const POSTER_ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

/**
 * Poster upload (B-01): `POST /admin/uploads/presign` then a direct PUT to the storage.
 * Resolves with the public URL to store in `posterVerticalUrl` / `posterHorizontalUrl`.
 */
export function usePosterUpload() {
  const api = useCatalogueApi()
  const transport = api.isMock ? mockUploadTransport : xhrUploadTransport

  function validate(file: File): 'type' | 'size' | null {
    if (!(POSTER_ACCEPTED_TYPES as readonly string[]).includes(file.type)) return 'type'
    if (file.size > POSTER_MAX_BYTES) return 'size'
    return null
  }

  async function upload(
    file: File,
    options: { onProgress?: (loaded: number, total: number) => void; signal?: AbortSignal } = {},
  ): Promise<string> {
    const presign = await api.presignPoster({ fileName: file.name, contentType: file.type })
    await transport(presign.uploadUrl, file, {
      headers: presign.headers,
      onProgress: options.onProgress,
      signal: options.signal,
    })
    return presign.publicUrl
  }

  return { upload, validate }
}
