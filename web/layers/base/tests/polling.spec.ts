import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminEpisode } from '../types/api'
import { createPoller, EPISODES_POLL_INTERVAL_MS, hasTranscodeInFlight } from '../utils/polling'
import episodesFixture from '../mocks/episodes.json'

const episodes = episodesFixture as AdminEpisode[]

describe('hasTranscodeInFlight', () => {
  it('is true while an episode is PROCESSING or UPLOADED, false otherwise', () => {
    expect(hasTranscodeInFlight(episodes)).toBe(true)
    const settled = episodes.map((episode) =>
      episode.transcodeStatus === 'PROCESSING' || episode.transcodeStatus === 'UPLOADED'
        ? { ...episode, transcodeStatus: 'READY' as const }
        : episode,
    )
    expect(hasTranscodeInFlight(settled)).toBe(false)
    expect(hasTranscodeInFlight([])).toBe(false)
  })
})

describe('episodes poller', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('polls every 5 s while the task asks to continue, then stops by itself', async () => {
    // Simulates PROCESSING → PROCESSING → READY.
    const task = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValue(false)
    const poller = createPoller({ intervalMs: EPISODES_POLL_INTERVAL_MS, task })

    poller.start()
    expect(poller.active).toBe(true)
    expect(task).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(4999)
    expect(task).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(task).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(5000)
    expect(task).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(5000)
    expect(task).toHaveBeenCalledTimes(3)
    expect(poller.active).toBe(false)

    await vi.advanceTimersByTimeAsync(20_000)
    expect(task).toHaveBeenCalledTimes(3)
  })

  it('does not overlap cycles when a task is slower than the interval', async () => {
    let resolveTask: (value: boolean) => void = () => {}
    const task = vi.fn(() => new Promise<boolean>((resolve) => (resolveTask = resolve)))
    const poller = createPoller({ intervalMs: 1000, task })
    poller.start()

    await vi.advanceTimersByTimeAsync(1000)
    expect(task).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(5000)
    expect(task).toHaveBeenCalledTimes(1)

    resolveTask(true)
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(1000)
    expect(task).toHaveBeenCalledTimes(2)
    poller.stop()
  })

  it('stop() cancels the pending cycle and start() is idempotent', async () => {
    const task = vi.fn().mockResolvedValue(true)
    const poller = createPoller({ intervalMs: 1000, task })
    poller.start()
    poller.start()
    await vi.advanceTimersByTimeAsync(1000)
    expect(task).toHaveBeenCalledTimes(1)

    poller.stop()
    expect(poller.active).toBe(false)
    await vi.advanceTimersByTimeAsync(5000)
    expect(task).toHaveBeenCalledTimes(1)
  })

  it('stops after a task error', async () => {
    const task = vi.fn().mockRejectedValue(new Error('network'))
    const poller = createPoller({ intervalMs: 1000, task })
    poller.start()
    await vi.advanceTimersByTimeAsync(1000)
    expect(task).toHaveBeenCalledTimes(1)
    expect(poller.active).toBe(false)
  })

  it('runNow() runs a cycle immediately', async () => {
    const task = vi.fn().mockResolvedValue(false)
    const poller = createPoller({ intervalMs: 1000, task })
    await poller.runNow()
    expect(task).toHaveBeenCalledTimes(1)
    expect(poller.active).toBe(false)
  })
})
