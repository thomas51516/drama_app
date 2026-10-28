import { computed, reactive, type ComputedRef } from 'vue'
import { UploadError, type UploadTransport } from './upload-transport'

/**
 * Upload orchestrator for the bulk episode upload (B-02).
 * Framework-agnostic apart from Vue reactivity: the page binds to `items` and `progress`.
 *
 * Per file: `prepare` (create the episode + request the upload URL) → `transport` (PUT with
 * progress) → `finalize` (POST /uploaded). At most `concurrency` files are in flight at once;
 * failed or cancelled items can be retried, queued or in-flight items can be cancelled.
 */

export type UploadItemStatus =
  'queued' | 'preparing' | 'uploading' | 'finalizing' | 'done' | 'error' | 'cancelled'

export interface UploadItem {
  id: string
  file: File
  /** Episode title derived from the file name (without extension). */
  title: string
  status: UploadItemStatus
  loaded: number
  total: number
  attempts: number
  error: string | null
  /** Set by `prepare`; kept across retries so a retry reuses the same episode. */
  episodeId: string | null
}

export interface PreparedUpload {
  episodeId: string
  uploadUrl: string
  headers: Record<string, string>
}

export interface UploadQueueHandlers {
  prepare(item: UploadItem, signal: AbortSignal): Promise<PreparedUpload>
  transport: UploadTransport
  finalize(item: UploadItem, prepared: PreparedUpload, signal: AbortSignal): Promise<void>
  /** Called when an item reaches `done` (e.g. to refresh the episode list). */
  onItemDone?: (item: UploadItem) => void
  /** Called when an item ends in `error`. */
  onItemError?: (item: UploadItem, error: unknown) => void
}

export interface UploadQueueOptions {
  concurrency?: number
}

export interface UploadProgress {
  loaded: number
  total: number
  percent: number
  done: number
  failed: number
  active: number
  queued: number
  count: number
}

export interface UploadQueue {
  readonly items: UploadItem[]
  readonly progress: ComputedRef<UploadProgress>
  readonly isBusy: ComputedRef<boolean>
  add(files: Iterable<File>): UploadItem[]
  retry(id: string): void
  retryFailed(): void
  cancel(id: string): void
  cancelAll(): void
  remove(id: string): void
  clearFinished(): void
}

export const DEFAULT_UPLOAD_CONCURRENCY = 3

export function fileBaseName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? fileName
  const index = base.lastIndexOf('.')
  return (index > 0 ? base.slice(0, index) : base).trim() || base
}

let itemCounter = 0

export function createUploadQueue(
  handlers: UploadQueueHandlers,
  options: UploadQueueOptions = {},
): UploadQueue {
  const concurrency = Math.max(1, options.concurrency ?? DEFAULT_UPLOAD_CONCURRENCY)
  const items = reactive<UploadItem[]>([]) as UploadItem[]
  const controllers = new Map<string, AbortController>()
  const prepared = new Map<string, PreparedUpload>()

  const isActive = (item: UploadItem): boolean =>
    item.status === 'preparing' || item.status === 'uploading' || item.status === 'finalizing'

  const progress = computed<UploadProgress>(() => {
    // Finished and cancelled items count as fully loaded so the global bar is monotonic.
    let loaded = 0
    let total = 0
    let done = 0
    let failed = 0
    let active = 0
    let queued = 0
    for (const item of items) {
      total += item.total
      if (item.status === 'done') {
        loaded += item.total
        done += 1
      } else if (item.status === 'error') {
        failed += 1
      } else if (item.status === 'cancelled') {
        loaded += item.total
      } else if (item.status === 'queued') {
        queued += 1
      } else {
        loaded += item.loaded
        active += 1
      }
    }
    return {
      loaded,
      total,
      percent: total === 0 ? 0 : Math.round((loaded / total) * 100),
      done,
      failed,
      active,
      queued,
      count: items.length,
    }
  })

  const isBusy = computed(() => items.some((item) => isActive(item) || item.status === 'queued'))

  async function run(item: UploadItem): Promise<void> {
    const controller = new AbortController()
    controllers.set(item.id, controller)
    const { signal } = controller
    item.attempts += 1
    item.error = null
    item.loaded = 0

    try {
      item.status = 'preparing'
      const target = await handlers.prepare(item, signal)
      if (signal.aborted) throw new UploadError('Upload cancelled', 0, true)
      item.episodeId = target.episodeId
      prepared.set(item.id, target)

      item.status = 'uploading'
      await handlers.transport(target.uploadUrl, item.file, {
        headers: target.headers,
        signal,
        onProgress: (loaded, total) => {
          item.loaded = loaded
          if (total > 0) item.total = total
        },
      })
      if (signal.aborted) throw new UploadError('Upload cancelled', 0, true)

      item.status = 'finalizing'
      await handlers.finalize(item, target, signal)
      item.loaded = item.total
      item.status = 'done'
      handlers.onItemDone?.(item)
    } catch (error) {
      const cancelled = signal.aborted || (UploadError.is(error) && error.cancelled)
      if (cancelled) {
        item.status = 'cancelled'
        item.error = null
      } else {
        item.status = 'error'
        item.error = error instanceof Error ? error.message : String(error)
        handlers.onItemError?.(item, error)
      }
    } finally {
      controllers.delete(item.id)
      pump()
    }
  }

  function pump(): void {
    let running = items.filter(isActive).length
    for (const item of items) {
      if (running >= concurrency) break
      if (item.status !== 'queued') continue
      running += 1
      void run(item)
    }
  }

  function add(files: Iterable<File>): UploadItem[] {
    const added: UploadItem[] = []
    for (const file of files) {
      itemCounter += 1
      const item: UploadItem = {
        id: `upl_${Date.now().toString(36)}_${itemCounter}`,
        file,
        title: fileBaseName(file.name),
        status: 'queued',
        loaded: 0,
        total: file.size,
        attempts: 0,
        error: null,
        episodeId: null,
      }
      items.push(item)
      added.push(items[items.length - 1] as UploadItem)
    }
    pump()
    return added
  }

  function retry(id: string): void {
    const item = items.find((candidate) => candidate.id === id)
    if (!item || (item.status !== 'error' && item.status !== 'cancelled')) return
    item.status = 'queued'
    item.loaded = 0
    item.error = null
    pump()
  }

  function retryFailed(): void {
    items.filter((item) => item.status === 'error').forEach((item) => retry(item.id))
  }

  function cancel(id: string): void {
    const item = items.find((candidate) => candidate.id === id)
    if (!item) return
    if (item.status === 'queued') {
      item.status = 'cancelled'
      return
    }
    controllers.get(id)?.abort()
  }

  function cancelAll(): void {
    items.forEach((item) => cancel(item.id))
  }

  function remove(id: string): void {
    const index = items.findIndex((candidate) => candidate.id === id)
    if (index === -1) return
    const item = items[index] as UploadItem
    if (isActive(item)) return
    items.splice(index, 1)
    prepared.delete(id)
  }

  function clearFinished(): void {
    for (let index = items.length - 1; index >= 0; index -= 1) {
      const item = items[index] as UploadItem
      if (item.status === 'done' || item.status === 'cancelled') {
        items.splice(index, 1)
        prepared.delete(item.id)
      }
    }
  }

  return {
    items,
    progress,
    isBusy,
    add,
    retry,
    retryFailed,
    cancel,
    cancelAll,
    remove,
    clearFinished,
  }
}
