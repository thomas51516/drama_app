import { describe, expect, it, vi } from 'vitest'
import { createUploadQueue, fileBaseName, type UploadItem } from '../utils/upload-queue'
import { UploadError, type UploadTransport } from '../utils/upload-transport'

/** Controllable transport: each call exposes its resolve/reject and progress callback. */
interface Pending {
  url: string
  file: Blob
  signal?: AbortSignal
  progress: (loaded: number, total: number) => void
  resolve: () => void
  reject: (error: unknown) => void
}

function fakeTransport() {
  const pending: Pending[] = []
  const transport: UploadTransport = (url, file, options = {}) =>
    new Promise<void>((resolve, reject) => {
      const entry: Pending = {
        url,
        file,
        signal: options.signal,
        progress: options.onProgress ?? (() => {}),
        resolve,
        reject,
      }
      options.signal?.addEventListener('abort', () =>
        reject(new UploadError('Upload cancelled', 0, true)),
      )
      pending.push(entry)
    })
  return { transport, pending }
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

function makeFile(name: string, size = 1000): File {
  return new File([new Uint8Array(size)], name, { type: 'video/mp4' })
}

function setup(options: { concurrency?: number; failPrepareOnce?: boolean } = {}) {
  const { transport, pending } = fakeTransport()
  let episodeCounter = 0
  let prepareFailuresLeft = options.failPrepareOnce ? 1 : 0
  const prepare = vi.fn(async (item: UploadItem) => {
    if (prepareFailuresLeft > 0) {
      prepareFailuresLeft -= 1
      throw new Error('prepare failed')
    }
    const episodeId = item.episodeId ?? `ep_${++episodeCounter}`
    return { episodeId, uploadUrl: `mock://upload/${episodeId}`, headers: {} }
  })
  const finalize = vi.fn(async () => {})
  const onItemDone = vi.fn()
  const onItemError = vi.fn()
  const queue = createUploadQueue(
    { prepare, transport, finalize, onItemDone, onItemError },
    { concurrency: options.concurrency ?? 3 },
  )
  return { queue, pending, prepare, finalize, onItemDone, onItemError }
}

describe('upload queue orchestrator', () => {
  it('derives the episode title from the file name without extension', () => {
    expect(fileBaseName('Episode 01.final.MP4')).toBe('Episode 01.final')
    expect(fileBaseName('noext')).toBe('noext')
    expect(fileBaseName('.hidden')).toBe('.hidden')
  })

  it('runs at most 3 uploads concurrently and starts the next one when a slot frees up', async () => {
    const { queue, pending, prepare } = setup()
    queue.add([1, 2, 3, 4, 5].map((n) => makeFile(`ep${n}.mp4`)))
    await flush()

    expect(prepare).toHaveBeenCalledTimes(3)
    expect(pending).toHaveLength(3)
    expect(queue.items.map((item) => item.status)).toEqual([
      'uploading',
      'uploading',
      'uploading',
      'queued',
      'queued',
    ])
    expect(queue.progress.value.active).toBe(3)
    expect(queue.progress.value.queued).toBe(2)

    pending[0]!.resolve()
    await flush()
    await flush()

    expect(queue.items[0]!.status).toBe('done')
    expect(prepare).toHaveBeenCalledTimes(4)
    expect(pending).toHaveLength(4)
    expect(queue.items.filter((item) => item.status === 'uploading')).toHaveLength(3)
  })

  it('aggregates per-file progress into a global percentage', async () => {
    const { queue, pending } = setup()
    queue.add([makeFile('a.mp4', 1000), makeFile('b.mp4', 3000)])
    await flush()

    pending[0]!.progress(500, 1000)
    pending[1]!.progress(1500, 3000)
    expect(queue.progress.value.loaded).toBe(2000)
    expect(queue.progress.value.total).toBe(4000)
    expect(queue.progress.value.percent).toBe(50)

    pending[0]!.resolve()
    pending[1]!.resolve()
    await flush()
    await flush()
    expect(queue.progress.value.percent).toBe(100)
    expect(queue.progress.value.done).toBe(2)
    expect(queue.isBusy.value).toBe(false)
  })

  it('marks a failed transport as error, then retry reuses the episode and only asks a new URL', async () => {
    const { queue, pending, prepare, finalize, onItemError, onItemDone } = setup()
    queue.add([makeFile('a.mp4')])
    await flush()

    pending[0]!.reject(new UploadError('Storage responded 500', 500))
    await flush()

    const item = queue.items[0]!
    expect(item.status).toBe('error')
    expect(item.error).toMatch(/500/)
    expect(item.episodeId).toBe('ep_1')
    expect(onItemError).toHaveBeenCalledTimes(1)
    expect(finalize).not.toHaveBeenCalled()

    queue.retry(item.id)
    await flush()
    expect(item.status).toBe('uploading')
    expect(item.attempts).toBe(2)
    // Second prepare receives the item with its episodeId so no new episode is created.
    expect(prepare).toHaveBeenCalledTimes(2)
    expect(prepare.mock.calls[1]![0].episodeId).toBe('ep_1')
    expect(pending[1]!.url).toBe('mock://upload/ep_1')

    pending[1]!.resolve()
    await flush()
    await flush()
    expect(item.status).toBe('done')
    expect(finalize).toHaveBeenCalledTimes(1)
    expect(onItemDone).toHaveBeenCalledTimes(1)
  })

  it('reports a failing prepare step as an error and retryFailed() requeues it', async () => {
    const { queue, pending } = setup({ failPrepareOnce: true })
    queue.add([makeFile('a.mp4')])
    await flush()
    expect(queue.items[0]!.status).toBe('error')
    expect(queue.items[0]!.error).toBe('prepare failed')

    queue.retryFailed()
    await flush()
    expect(queue.items[0]!.status).toBe('uploading')
    pending[0]!.resolve()
    await flush()
    await flush()
    expect(queue.items[0]!.status).toBe('done')
  })

  it('cancels a queued item without starting it and aborts an in-flight one', async () => {
    const { queue, pending, prepare, finalize } = setup({ concurrency: 1 })
    queue.add([makeFile('a.mp4'), makeFile('b.mp4')])
    await flush()
    const [first, second] = queue.items as [UploadItem, UploadItem]
    expect(first.status).toBe('uploading')
    expect(second.status).toBe('queued')

    queue.cancel(second.id)
    expect(second.status).toBe('cancelled')

    queue.cancel(first.id)
    await flush()
    expect(pending[0]!.signal?.aborted).toBe(true)
    expect(first.status).toBe('cancelled')
    expect(first.error).toBeNull()
    expect(finalize).not.toHaveBeenCalled()
    // The cancelled queued item never started.
    expect(prepare).toHaveBeenCalledTimes(1)
    expect(queue.isBusy.value).toBe(false)

    // A cancelled item can be retried.
    queue.retry(second.id)
    await flush()
    expect(second.status).toBe('uploading')
  })

  it('cancelAll() stops everything and clearFinished() removes done/cancelled rows', async () => {
    const { queue, pending } = setup()
    queue.add([makeFile('a.mp4'), makeFile('b.mp4'), makeFile('c.mp4'), makeFile('d.mp4')])
    await flush()
    pending[0]!.resolve()
    await flush()
    await flush()

    queue.cancelAll()
    await flush()
    expect(queue.items.map((item) => item.status)).toEqual([
      'done',
      'cancelled',
      'cancelled',
      'cancelled',
    ])
    queue.clearFinished()
    expect(queue.items).toHaveLength(0)
  })

  it('remove() ignores in-flight items', async () => {
    const { queue } = setup()
    queue.add([makeFile('a.mp4')])
    await flush()
    queue.remove(queue.items[0]!.id)
    expect(queue.items).toHaveLength(1)
  })
})
