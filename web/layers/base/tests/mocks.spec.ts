import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useAuthStore } from '../stores/auth'
import { useCatalogueApi } from '../composables/useCatalogueApi'
import { mockCredentials, mockTiming, resetMockState } from '../mocks'
import { mockUploadTiming, mockUploadTransport } from '../utils/upload-transport'
import { createUploadQueue } from '../utils/upload-queue'
import { episodeContentType } from '../utils/episode-files'
import type { AdminEpisode, TranscodeStatus } from '../types/api'

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

async function signIn(email = mockCredentials.email): Promise<void> {
  const auth = useAuthStore()
  auth.clearSession()
  await auth.login(email, mockCredentials.password)
  await auth.verifyTotp(mockCredentials.totpCode)
}

async function waitForStatus(
  seriesId: string,
  episodeId: string,
  status: TranscodeStatus,
  timeoutMs = 2000,
): Promise<AdminEpisode> {
  const api = useCatalogueApi()
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const episode = (await api.listEpisodes(seriesId)).find((e) => e.id === episodeId)
    if (episode?.transcodeStatus === status) return episode
    if (Date.now() > deadline) throw new Error(`Episode never reached ${status}`)
    await sleep(20)
  }
}

describe('mock admin API — full catalogue flow', () => {
  const timing = { ...mockTiming }
  const uploadTiming = { ...mockUploadTiming }

  beforeEach(() => {
    Object.assign(mockTiming, { latencyMs: 0, uploadedToProcessingMs: 30, processingToReadyMs: 60 })
    Object.assign(mockUploadTiming, { minDurationMs: 20, maxDurationMs: 20, steps: 4 })
    resetMockState()
  })

  afterEach(() => {
    Object.assign(mockTiming, timing)
    Object.assign(mockUploadTiming, uploadTiming)
    resetMockState()
    useAuthStore().clearSession()
  })

  it('serves the contract shapes with status and q filters and pagination', async () => {
    await signIn()
    const api = useCatalogueApi()

    const all = await api.listSeries({ page: 1, pageSize: 2 })
    expect(all.total).toBe(4)
    expect(all.items).toHaveLength(2)
    expect(all.page).toBe(1)
    expect(all.pageSize).toBe(2)
    expect(all.items[0]).toMatchObject({
      id: expect.any(String),
      slug: expect.any(String),
      episodeCount: expect.any(Number),
      territories: expect.any(Array),
    })

    const drafts = await api.listSeries({ status: 'DRAFT' })
    expect(drafts.items.every((series) => series.status === 'DRAFT')).toBe(true)
    expect(drafts.total).toBe(1)

    const searched = await api.listSeries({ q: 'abidjan' })
    expect(searched.items.map((series) => series.slug)).toEqual(['retour-a-abidjan'])
  })

  it('creates a series, refuses to publish without READY episode (409), uploads, transcodes, publishes', async () => {
    await signIn()
    const api = useCatalogueApi()

    const created = await api.createSeries({
      title: 'Série de test',
      synopsis: 'Synopsis',
      genres: ['romance'],
      tags: [],
      language: 'fr',
      ageRating: 'ALL',
      posterVerticalUrl: null,
      posterHorizontalUrl: null,
      freeEpisodeCount: 2,
      coinCostPerEpisode: 10,
      territories: ['FR'],
    })
    expect(created.status).toBe('DRAFT')
    expect(created.slug).toBe('serie-de-test')
    expect((await api.getSeries(created.id)).title).toBe('Série de test')

    await expect(api.publishSeries(created.id)).rejects.toMatchObject({
      status: 409,
      code: 'SERIES_NO_READY_EPISODE',
    })

    // Bulk upload through the real orchestrator + mock transport (what the page does).
    const file = new File([new Uint8Array(2048)], 'Episode 01.mp4', { type: 'video/mp4' })
    const queue = createUploadQueue(
      {
        async prepare(item, signal) {
          const episode = await api.createEpisode(created.id, { title: item.title }, signal)
          const target = await api.requestUploadUrl(
            episode.id,
            { fileName: file.name, contentType: episodeContentType(file), sizeBytes: file.size },
            signal,
          )
          expect(target.uploadUrl).toMatch(/^mock:\/\/upload\/sources\//)
          expect(target.sourceKey).toBe(`sources/${created.id}/${episode.id}/${file.name}`)
          return { episodeId: episode.id, uploadUrl: target.uploadUrl, headers: target.headers }
        },
        transport: mockUploadTransport,
        async finalize(_item, prepared, signal) {
          const episode = await api.markUploaded(prepared.episodeId, signal)
          expect(episode.transcodeStatus).toBe('UPLOADED')
        },
      },
      { concurrency: 3 },
    )
    const [item] = queue.add([file])
    const deadline = Date.now() + 2000
    while (item!.status !== 'done' && Date.now() < deadline) await sleep(10)
    expect(item!.status).toBe('done')
    expect(item!.episodeId).toBeTruthy()

    const episodes = await api.listEpisodes(created.id)
    expect(episodes).toHaveLength(1)
    expect(episodes[0]!.title).toBe('Episode 01')
    expect(episodes[0]!.number).toBe(1)

    const ready = await waitForStatus(created.id, item!.episodeId as string, 'READY')
    expect(ready.hlsKey).toMatch(/master\.m3u8$/)
    expect(ready.durationSeconds).toBeGreaterThan(0)

    const published = await api.publishSeries(created.id)
    expect(published.status).toBe('PUBLISHED')
    expect(published.publishedAt).toBeTruthy()
    expect((await api.getSeries(created.id)).episodeCount).toBe(1)

    const archived = await api.archiveSeries(created.id)
    expect(archived.status).toBe('ARCHIVED')
  })

  it('supports rename, reorder, retranscode and delete of episodes', async () => {
    await signIn()
    const api = useCatalogueApi()
    const seriesId = 'ser_01HZX0A1B2C3D4E5F6G7H8J9K0'
    const before = await api.listEpisodes(seriesId)
    expect(before.map((e) => e.number)).toEqual([1, 2, 3, 4])

    const renamed = await api.updateEpisode(before[0]!.id, { title: 'Nouveau titre' })
    expect(renamed.title).toBe('Nouveau titre')

    const reordered = await api.reorderEpisodes(
      seriesId,
      [before[1]!, before[0]!, before[2]!, before[3]!].map((e) => e.id),
    )
    expect(reordered.map((e) => e.id)).toEqual([
      before[1]!.id,
      before[0]!.id,
      before[2]!.id,
      before[3]!.id,
    ])
    expect(reordered.map((e) => e.number)).toEqual([1, 2, 3, 4])
    await expect(api.reorderEpisodes(seriesId, [before[0]!.id])).rejects.toMatchObject({
      status: 400,
    })

    const failed = before.find((e) => e.transcodeStatus === 'FAILED')!
    const requeued = await api.retranscodeEpisode(failed.id)
    expect(requeued.transcodeStatus).toBe('UPLOADED')
    expect(requeued.transcodeError).toBeNull()
    await waitForStatus(seriesId, failed.id, 'READY')

    await api.deleteEpisode(before[2]!.id)
    const after = await api.listEpisodes(seriesId)
    expect(after).toHaveLength(3)
    expect(after.map((e) => e.number)).toEqual([1, 2, 3])
    expect((await api.getSeries(seriesId)).episodeCount).toBe(3)
  })

  it('presigns posters and rejects non-image content types', async () => {
    await signIn()
    const api = useCatalogueApi()
    const presign = await api.presignPoster({ fileName: 'poster.jpg', contentType: 'image/jpeg' })
    expect(presign.method).toBe('PUT')
    expect(presign.uploadUrl).toMatch(/^mock:\/\/upload\/posters\//)
    expect(presign.publicUrl).toMatch(/^mock:\/\/assets\/posters\//)
    await expect(
      api.presignPoster({ fileName: 'x.mp4', contentType: 'video/mp4' }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('enforces roles: EDITOR cannot change monetisation, SUPPORT cannot edit, first login enrols TOTP', async () => {
    await signIn('editor@drama.local')
    expect(useAuthStore().user?.role).toBe('EDITOR')
    const api = useCatalogueApi()
    const seriesId = 'ser_01HZX0A1B2C3D4E5F6G7H8J9K2'
    await expect(
      api.updateSeries(seriesId, { title: 'OK pour un éditeur' }),
    ).resolves.toMatchObject({
      title: 'OK pour un éditeur',
    })
    await expect(api.updateSeries(seriesId, { coinCostPerEpisode: 99 })).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
    })

    await signIn('support@drama.local')
    await expect(api.updateSeries(seriesId, { title: 'Interdit' })).rejects.toMatchObject({
      status: 403,
    })
    await expect(api.listSeries()).resolves.toBeTruthy()

    const auth = useAuthStore()
    auth.clearSession()
    const step = await auth.login('money@drama.local', mockCredentials.password)
    expect(step).toBe('totp_setup')
    expect(auth.totpSetup?.secret).toBeTruthy()
    expect(auth.totpSetup?.otpauthUri).toContain('money%40drama.local')
    const user = await auth.verifyTotp(mockCredentials.totpCode)
    expect(user.role).toBe('MONETIZATION')
    // A MONETIZATION user may change prices but not catalogue fields.
    await expect(api.updateSeries(seriesId, { coinCostPerEpisode: 99 })).resolves.toMatchObject({
      coinCostPerEpisode: 99,
    })
    await expect(api.updateSeries(seriesId, { title: 'Non' })).rejects.toMatchObject({
      status: 403,
    })
  })
})
