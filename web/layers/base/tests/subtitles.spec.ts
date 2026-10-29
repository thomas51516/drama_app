import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useAuthStore } from '../stores/auth'
import { useSubtitlesApi } from '../composables/useSubtitlesApi'
import { mockCredentials, mockTiming, resetMockState } from '../mocks'
import type { Subtitle } from '../types/api'
import {
  defaultTrackIndex,
  isIsoLanguageCode,
  languageName,
  removeSubtitle,
  sortSubtitles,
  srtToVtt,
  subtitleTracks,
  upsertSubtitle,
  validateSubtitleFile,
} from '../utils/subtitles'

const EPISODE = 'ep_01HZX0E0000000000000000001'

function subtitle(language: string, id = `sub_${language}`): Subtitle {
  return {
    id,
    episodeId: EPISODE,
    language,
    fileUrl: `https://cdn.test/subtitles/${EPISODE}/${language}.vtt`,
    label: null,
    createdAt: '2026-10-29T00:00:00.000Z',
  }
}

async function signIn(email = mockCredentials.email): Promise<void> {
  const auth = useAuthStore()
  auth.clearSession()
  await auth.login(email, mockCredentials.password)
  await auth.verifyTotp(mockCredentials.totpCode)
}

describe('subtitles helpers (B-03)', () => {
  it('validates extension, size and emptiness', () => {
    expect(validateSubtitleFile({ name: 'ep1.fr.srt', size: 1200 })).toBeNull()
    expect(validateSubtitleFile({ name: 'EP1.VTT', size: 1200 })).toBeNull()
    expect(validateSubtitleFile({ name: 'ep1.txt', size: 1200 })).toBe('type')
    expect(validateSubtitleFile({ name: 'ep1.srt', size: 0 })).toBe('empty')
    expect(validateSubtitleFile({ name: 'ep1.srt', size: 2 * 1024 * 1024 + 1 })).toBe('size')
  })

  it('accepts ISO 639-1 codes only', () => {
    expect(isIsoLanguageCode('fr')).toBe(true)
    expect(isIsoLanguageCode('yor')).toBe(true)
    expect(isIsoLanguageCode('FR')).toBe(false)
    expect(isIsoLanguageCode('french')).toBe(false)
  })

  it('converts SRT to WebVTT (header, dotted timestamps, CRLF)', () => {
    const srt =
      '﻿1\r\n00:00:01,000 --> 00:00:04,500\r\nBonjour\r\n\r\n2\r\n00:00:05,000 --> 00:00:06,000\r\nAu revoir\r\n'
    const vtt = srtToVtt(srt)
    expect(vtt.startsWith('WEBVTT\n\n')).toBe(true)
    expect(vtt).toContain('00:00:01.000 --> 00:00:04.500')
    expect(vtt).not.toContain(',')
    expect(vtt).not.toContain('\r')
  })

  it('sorts known languages first, upserts by language and removes by id', () => {
    const list = sortSubtitles([subtitle('pt'), subtitle('de'), subtitle('fr'), subtitle('ar')])
    expect(list.map((s) => s.language)).toEqual(['fr', 'pt', 'ar', 'de'])

    const replaced = upsertSubtitle(list, subtitle('fr', 'sub_fr_v2'))
    expect(replaced).toHaveLength(4)
    expect(replaced.find((s) => s.language === 'fr')?.id).toBe('sub_fr_v2')

    const added = upsertSubtitle(replaced, subtitle('en'))
    expect(added.map((s) => s.language)).toEqual(['fr', 'en', 'pt', 'ar', 'de'])
    expect(removeSubtitle(added, 'sub_en').map((s) => s.language)).toEqual(['fr', 'pt', 'ar', 'de'])
  })

  it('builds preview tracks from resolvable URLs and picks the UI locale by default', () => {
    const tracks = subtitleTracks(
      [subtitle('en'), subtitle('fr'), { ...subtitle('es'), fileUrl: 'mock://assets/missing.vtt' }],
      (url) => (url.startsWith('mock://') ? null : url),
      'fr',
    )
    expect(tracks.map((track) => track.language)).toEqual(['fr', 'en'])
    expect(tracks[0]?.label).toBe(languageName('fr', 'fr'))
    expect(tracks[0]?.src).toMatch(/fr\.vtt$/)
    expect(defaultTrackIndex(tracks, 'en')).toBe(1)
    expect(defaultTrackIndex(tracks, 'de')).toBe(0)
    expect(defaultTrackIndex([], 'fr')).toBe(-1)
  })
})

describe('mock subtitles API', () => {
  const timing = { ...mockTiming }

  beforeEach(() => {
    Object.assign(mockTiming, { latencyMs: 0 })
    resetMockState()
  })

  afterEach(() => {
    Object.assign(mockTiming, timing)
    resetMockState()
    useAuthStore().clearSession()
  })

  it('lists fixture subtitles, uploads an SRT (converted, replacing the language) and deletes', async () => {
    await signIn('editor@drama.local')
    const api = useSubtitlesApi()

    const before = await api.listSubtitles(EPISODE)
    expect(before.map((s) => s.language).sort()).toEqual(['en', 'fr'])

    const file = new File(['1\n00:00:01,000 --> 00:00:02,000\nHola\n'], 'ep1.es.srt', {
      type: 'application/x-subrip',
    })
    const created = await api.uploadSubtitle(EPISODE, file, 'ES')
    expect(created.language).toBe('es')
    expect(created.fileUrl).toBe(`mock://assets/subtitles/${EPISODE}/es.vtt`)

    const replaced = await api.uploadSubtitle(EPISODE, file, 'es')
    expect(replaced.id).toBe(created.id)
    const after = await api.listSubtitles(EPISODE)
    expect(after.filter((s) => s.language === 'es')).toHaveLength(1)
    expect(after).toHaveLength(3)

    await api.deleteSubtitle(created.id)
    expect((await api.listSubtitles(EPISODE)).map((s) => s.language).sort()).toEqual(['en', 'fr'])
    await expect(api.deleteSubtitle(created.id)).rejects.toMatchObject({ status: 404 })
  })

  it('rejects bad files, bad languages and read-only roles', async () => {
    await signIn('editor@drama.local')
    const api = useSubtitlesApi()
    const srt = new File(['x'], 'ep1.srt')
    await expect(
      api.uploadSubtitle(EPISODE, new File(['x'], 'ep1.txt'), 'fr'),
    ).rejects.toMatchObject({
      status: 400,
      code: 'UNSUPPORTED_MEDIA_TYPE',
    })
    await expect(api.uploadSubtitle(EPISODE, srt, 'français')).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    })
    await expect(api.uploadSubtitle('ep_missing', srt, 'fr')).rejects.toMatchObject({ status: 404 })

    await signIn('support@drama.local')
    await expect(api.listSubtitles(EPISODE)).resolves.toBeTruthy()
    await expect(api.uploadSubtitle(EPISODE, srt, 'fr')).rejects.toMatchObject({ status: 403 })
  })
})
