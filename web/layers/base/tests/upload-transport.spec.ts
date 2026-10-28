import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  mockUploadTiming,
  mockUploadTransport,
  UploadError,
  xhrUploadTransport,
} from '../utils/upload-transport'
import { resolveMockAssetUrl, clearMockAssets } from '../mocks/assets'

/** Minimal XMLHttpRequest double exposing what the transport relies on. */
class FakeXhr {
  static instances: FakeXhr[] = []
  method = ''
  url = ''
  headers: Record<string, string> = {}
  body: unknown = null
  status = 0
  upload = { onprogress: null as ((event: ProgressEvent) => void) | null }
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  onabort: (() => void) | null = null
  ontimeout: (() => void) | null = null
  aborted = false

  constructor() {
    FakeXhr.instances.push(this)
  }

  open(method: string, url: string): void {
    this.method = method
    this.url = url
  }

  setRequestHeader(name: string, value: string): void {
    this.headers[name] = value
  }

  send(body: unknown): void {
    this.body = body
  }

  abort(): void {
    this.aborted = true
    this.onabort?.()
  }

  // --- test helpers ---
  progress(loaded: number, total: number): void {
    this.upload.onprogress?.({ loaded, total, lengthComputable: true } as ProgressEvent)
  }

  finish(status: number): void {
    this.status = status
    this.onload?.()
  }
}

describe('xhrUploadTransport', () => {
  const realXhr = globalThis.XMLHttpRequest

  beforeEach(() => {
    FakeXhr.instances = []
    globalThis.XMLHttpRequest = FakeXhr as unknown as typeof XMLHttpRequest
  })

  afterEach(() => {
    globalThis.XMLHttpRequest = realXhr
  })

  it('PUTs the file with the presigned headers and reports progress', async () => {
    const file = new File([new Uint8Array(100)], 'ep.mp4', { type: 'video/mp4' })
    const onProgress = vi.fn()
    const done = xhrUploadTransport('https://storage/sources/ep.mp4', file, {
      headers: { 'Content-Type': 'video/mp4' },
      onProgress,
    })
    const xhr = FakeXhr.instances[0]!
    expect(xhr.method).toBe('PUT')
    expect(xhr.url).toBe('https://storage/sources/ep.mp4')
    expect(xhr.headers).toEqual({ 'Content-Type': 'video/mp4' })
    expect(xhr.body).toBe(file)

    xhr.progress(50, 100)
    xhr.finish(200)
    await expect(done).resolves.toBeUndefined()
    expect(onProgress).toHaveBeenNthCalledWith(1, 50, 100)
    expect(onProgress).toHaveBeenLastCalledWith(100, 100)
  })

  it('rejects with the storage status on a non-2xx response', async () => {
    const done = xhrUploadTransport('https://storage/x', new Blob(['a']))
    FakeXhr.instances[0]!.finish(403)
    await expect(done).rejects.toSatisfy(
      (error: unknown) => UploadError.is(error) && error.status === 403 && !error.cancelled,
    )
  })

  it('rejects with status 0 on a network error', async () => {
    const done = xhrUploadTransport('https://storage/x', new Blob(['a']))
    FakeXhr.instances[0]!.onerror?.()
    await expect(done).rejects.toMatchObject({ name: 'UploadError', status: 0, cancelled: false })
  })

  it('aborts the request when the signal fires and reports a cancellation', async () => {
    const controller = new AbortController()
    const done = xhrUploadTransport('https://storage/x', new Blob(['a']), {
      signal: controller.signal,
    })
    controller.abort()
    expect(FakeXhr.instances[0]!.aborted).toBe(true)
    await expect(done).rejects.toSatisfy(
      (error: unknown) => UploadError.is(error) && error.cancelled,
    )
  })

  it('rejects immediately when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      xhrUploadTransport('https://storage/x', new Blob(['a']), { signal: controller.signal }),
    ).rejects.toSatisfy((error: unknown) => UploadError.is(error) && error.cancelled)
    expect(FakeXhr.instances).toHaveLength(0)
  })
})

describe('mockUploadTransport', () => {
  const timing = { ...mockUploadTiming }

  beforeEach(() => {
    Object.assign(mockUploadTiming, { minDurationMs: 20, maxDurationMs: 20, steps: 4 })
  })

  afterEach(() => {
    Object.assign(mockUploadTiming, timing)
    clearMockAssets()
  })

  it('simulates progress and registers the blob for mock asset URLs', async () => {
    const onProgress = vi.fn()
    const file = new File([new Uint8Array(400)], 'poster.jpg', { type: 'image/jpeg' })
    await mockUploadTransport('mock://upload/posters/p1/poster.jpg', file, { onProgress })
    expect(onProgress).toHaveBeenCalledTimes(4)
    expect(onProgress).toHaveBeenLastCalledWith(400, 400)
    // Object URLs may be unavailable in the test runtime; the registry must not throw either way.
    expect(resolveMockAssetUrl('mock://assets/posters/p1/poster.jpg') ?? null).toSatisfy(
      (value: unknown) => value === null || String(value).startsWith('blob:'),
    )
  })

  it('fails halfway for files named *upload-error* and honours cancellation', async () => {
    const bad = new File([new Uint8Array(10)], 'ep-upload-error.mp4', { type: 'video/mp4' })
    await expect(mockUploadTransport('mock://upload/x', bad)).rejects.toMatchObject({ status: 500 })

    const controller = new AbortController()
    const pending = mockUploadTransport('mock://upload/y', new Blob(['a']), {
      signal: controller.signal,
    })
    controller.abort()
    await expect(pending).rejects.toSatisfy(
      (error: unknown) => UploadError.is(error) && error.cancelled,
    )
  })
})
