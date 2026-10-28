import type { AdminEpisode } from '../types/api'

/** The back-office polls the episode list every 5 s while a transcode is in flight (contract). */
export const EPISODES_POLL_INTERVAL_MS = 5000

/** True while at least one episode is waiting for or undergoing transcoding. */
export function hasTranscodeInFlight(episodes: readonly AdminEpisode[]): boolean {
  return episodes.some(
    (episode) => episode.transcodeStatus === 'PROCESSING' || episode.transcodeStatus === 'UPLOADED',
  )
}

export interface PollerOptions {
  intervalMs: number
  /** Runs once per cycle; return `true` to schedule the next cycle, `false` to stop. */
  task: () => Promise<boolean> | boolean
}

export interface Poller {
  readonly active: boolean
  /** Schedule the first cycle after `intervalMs` (no-op when already active). */
  start(): void
  /** Run a cycle right now (keeps polling if the task says so). */
  runNow(): Promise<void>
  stop(): void
}

/**
 * Timer-based poller that never overlaps cycles: the next tick is scheduled after the task
 * settles, and a task error stops the loop (the caller decides whether to restart).
 */
export function createPoller(options: PollerOptions): Poller {
  let timer: ReturnType<typeof setTimeout> | null = null
  let active = false
  let running = false

  function schedule(): void {
    if (!active) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      void cycle()
    }, options.intervalMs)
  }

  async function cycle(): Promise<void> {
    if (running || !active) return
    running = true
    let again: boolean
    try {
      again = await options.task()
    } catch {
      again = false
    } finally {
      running = false
    }
    if (!active) return
    if (again) schedule()
    else stop()
  }

  function start(): void {
    if (active) return
    active = true
    schedule()
  }

  function stop(): void {
    active = false
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  return {
    get active() {
      return active
    },
    start,
    runNow: async () => {
      if (!active) active = true
      await cycle()
    },
    stop,
  }
}
