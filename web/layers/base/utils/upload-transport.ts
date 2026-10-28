import { registerMockAsset, isMockUploadUrl } from '../mocks/assets'

/**
 * Direct browser → object storage upload (single PUT on a presigned URL).
 * The contract caps a source file at 2 GB; multipart/resumable upload is a later ticket.
 */

export interface UploadTransportOptions {
  headers?: Record<string, string>
  onProgress?: (loaded: number, total: number) => void
  signal?: AbortSignal
}

export type UploadTransport = (
  url: string,
  file: Blob,
  options?: UploadTransportOptions,
) => Promise<void>

export class UploadError extends Error {
  readonly status: number
  readonly cancelled: boolean

  constructor(message: string, status = 0, cancelled = false) {
    super(message)
    this.name = 'UploadError'
    this.status = status
    this.cancelled = cancelled
  }

  static is(error: unknown): error is UploadError {
    return error instanceof UploadError
  }
}

/** PUT the file with XMLHttpRequest (the only browser API exposing upload progress). */
export const xhrUploadTransport: UploadTransport = (url, file, options = {}) =>
  new Promise<void>((resolve, reject) => {
    const { headers = {}, onProgress, signal } = options
    if (signal?.aborted) {
      reject(new UploadError('Upload cancelled', 0, true))
      return
    }

    const xhr = new XMLHttpRequest()
    const onAbort = (): void => xhr.abort()
    signal?.addEventListener('abort', onAbort, { once: true })
    const cleanup = (): void => signal?.removeEventListener('abort', onAbort)

    xhr.open('PUT', url, true)
    for (const [name, value] of Object.entries(headers)) {
      xhr.setRequestHeader(name, value)
    }

    xhr.upload.onprogress = (event) => {
      const total = event.lengthComputable ? event.total : file.size
      onProgress?.(Math.min(event.loaded, total), total)
    }
    xhr.onload = () => {
      cleanup()
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(file.size, file.size)
        resolve()
      } else {
        reject(new UploadError(`Storage responded ${xhr.status}`, xhr.status))
      }
    }
    xhr.onerror = () => {
      cleanup()
      reject(new UploadError('Network error during upload', 0))
    }
    xhr.onabort = () => {
      cleanup()
      reject(new UploadError('Upload cancelled', 0, true))
    }
    xhr.ontimeout = () => {
      cleanup()
      reject(new UploadError('Upload timed out', 0))
    }
    xhr.send(file)
  })

/** Timing of the simulated upload (overridable in tests). */
export const mockUploadTiming = {
  minDurationMs: 600,
  maxDurationMs: 2500,
  msPerMegabyte: 150,
  steps: 10,
}

/**
 * Simulated transport for mock mode: progresses in steps, honours cancellation, stores the blob
 * so posters can be previewed, and fails at 50 % when the file name contains `upload-error`
 * (to demo the retry button).
 */
export const mockUploadTransport: UploadTransport = (url, file, options = {}) =>
  new Promise<void>((resolve, reject) => {
    const { onProgress, signal } = options
    if (signal?.aborted) {
      reject(new UploadError('Upload cancelled', 0, true))
      return
    }
    const megabytes = file.size / (1024 * 1024)
    const duration = Math.min(
      mockUploadTiming.maxDurationMs,
      Math.max(mockUploadTiming.minDurationMs, megabytes * mockUploadTiming.msPerMegabyte),
    )
    const steps = mockUploadTiming.steps
    const shouldFail = 'name' in file && String((file as File).name).includes('upload-error')
    let step = 0
    let timer: ReturnType<typeof setTimeout> | null = null

    const onAbort = (): void => {
      if (timer) clearTimeout(timer)
      reject(new UploadError('Upload cancelled', 0, true))
    }
    signal?.addEventListener('abort', onAbort, { once: true })

    const tick = (): void => {
      step += 1
      onProgress?.(Math.round((file.size * step) / steps), file.size)
      if (shouldFail && step >= steps / 2) {
        signal?.removeEventListener('abort', onAbort)
        reject(new UploadError('Storage responded 500', 500))
        return
      }
      if (step >= steps) {
        signal?.removeEventListener('abort', onAbort)
        if (isMockUploadUrl(url)) registerMockAsset(url, file)
        resolve()
        return
      }
      timer = setTimeout(tick, duration / steps)
    }
    timer = setTimeout(tick, duration / steps)
  })
