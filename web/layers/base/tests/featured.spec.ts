import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useAuthStore } from '../stores/auth'
import { useFeaturedApi } from '../composables/useFeaturedApi'
import { mockCredentials, mockTiming, resetMockState } from '../mocks'
import type { HomeBanner, PublicHomeResponse } from '../types/api'
import {
  bannerFormToInput,
  bannerSchedule,
  bannerToForm,
  emptyBannerForm,
  emptyRowForm,
  inferRowType,
  isValidRowKey,
  moveItem,
  normalizeHomePreview,
  orderIds,
  rowFormToInput,
  rowTitleFor,
  suggestRowKey,
  validateBannerForm,
  validateRowForm,
  withPositions,
} from '../utils/featured'

const SERIES_A = 'ser_01HZX0A1B2C3D4E5F6G7H8J9K0'
const SERIES_B = 'ser_01HZX0A1B2C3D4E5F6G7H8J9K1'

async function signIn(email = mockCredentials.email): Promise<void> {
  const auth = useAuthStore()
  auth.clearSession()
  await auth.login(email, mockCredentials.password)
  await auth.verifyTotp(mockCredentials.totpCode)
}

describe('featured helpers (B-05) — ordering', () => {
  it('moves items and renumbers positions', () => {
    const list = [
      { id: 'a', position: 1 },
      { id: 'b', position: 2 },
      { id: 'c', position: 3 },
    ]
    const moved = withPositions(moveItem(list, 2, 0))
    expect(orderIds(moved)).toEqual(['c', 'a', 'b'])
    expect(moved.map((item) => item.position)).toEqual([1, 2, 3])
    expect(moveItem(list, 5, 0)).toEqual(list)
  })
})

describe('featured helpers (B-05) — forms', () => {
  it('validates a banner (series, title, image, countries, date range)', () => {
    const errors = validateBannerForm(emptyBannerForm())
    expect(errors).toMatchObject({
      seriesId: 'validation.required',
      title: 'validation.required',
      imageUrl: 'validation.required',
    })

    const bad = {
      ...emptyBannerForm(),
      seriesId: SERIES_A,
      title: 'x',
      imageUrl: 'https://cdn/x.jpg',
      countries: ['fr'],
      startsAt: new Date('2026-11-02'),
      endsAt: new Date('2026-11-01'),
    }
    expect(validateBannerForm(bad)).toEqual({
      countries: 'validation.isoCountry',
      endsAt: 'validation.dateRange',
    })
  })

  it('maps a banner to a form and back with ISO dates and trimmed strings', () => {
    const banner: HomeBanner = {
      id: 'bnr_1',
      seriesId: SERIES_A,
      imageUrl: 'https://cdn/x.jpg',
      title: 'Titre',
      subtitle: null,
      countries: ['TG'],
      position: 1,
      isActive: true,
      startsAt: '2026-10-01T00:00:00.000Z',
      endsAt: null,
    }
    const form = bannerToForm(banner)
    expect(form.startsAt?.toISOString()).toBe('2026-10-01T00:00:00.000Z')
    const input = bannerFormToInput({ ...form, title: '  Titre  ', subtitle: '   ' })
    expect(input).toMatchObject({
      seriesId: SERIES_A,
      title: 'Titre',
      subtitle: null,
      startsAt: '2026-10-01T00:00:00.000Z',
      endsAt: null,
    })
  })

  it('computes the schedule state of a banner', () => {
    const now = new Date('2026-10-29T12:00:00.000Z')
    expect(bannerSchedule({ isActive: false, startsAt: null, endsAt: null }, now)).toBe('inactive')
    expect(bannerSchedule({ isActive: true, startsAt: null, endsAt: null }, now)).toBe('live')
    expect(
      bannerSchedule({ isActive: true, startsAt: '2026-11-01T00:00:00.000Z', endsAt: null }, now),
    ).toBe('scheduled')
    expect(
      bannerSchedule({ isActive: true, startsAt: null, endsAt: '2026-10-01T00:00:00.000Z' }, now),
    ).toBe('expired')
  })

  it('suggests and validates row keys', () => {
    expect(
      suggestRowKey({ type: 'TRENDING', genre: null, titles: { fr: 'x', en: '', es: '', pt: '' } }),
    ).toBe('trending')
    expect(
      suggestRowKey({
        type: 'GENRE',
        genre: 'romance',
        titles: { fr: 'x', en: '', es: '', pt: '' },
      }),
    ).toBe('genre-romance')
    expect(
      suggestRowKey({
        type: 'MANUAL',
        genre: null,
        titles: { fr: 'Sélection de la rédaction !', en: '', es: '', pt: '' },
      }),
    ).toBe('selection-de-la-redaction')
    expect(isValidRowKey('genre-romance')).toBe(true)
    expect(isValidRowKey('Genre:romance')).toBe(false)
    expect(isValidRowKey('a')).toBe(false)
    expect(validateRowForm({ ...emptyRowForm(), key: 'Bad Key' }).key).toBe('validation.rowKey')
  })

  it('validates rows by type and clears irrelevant fields', () => {
    expect(validateRowForm(emptyRowForm())).toEqual({
      key: 'validation.required',
      titles: 'validation.requiredFrench',
      seriesIds: 'validation.atLeastOne',
    })

    const genre = {
      ...emptyRowForm(),
      key: 'genre-romance',
      type: 'GENRE' as const,
      titles: { fr: 'Romance', en: '', es: '', pt: '' },
    }
    expect(validateRowForm(genre)).toEqual({ genre: 'validation.required' })
    expect(validateRowForm({ ...genre, genre: 'western' })).toEqual({
      genre: 'validation.unknownValue',
    })

    const manual = {
      ...emptyRowForm(),
      key: 'selection',
      titles: { fr: 'Sélection', en: 'Picks', es: '', pt: '' },
      seriesIds: [SERIES_A, SERIES_A],
      genre: 'romance',
    }
    expect(validateRowForm(manual)).toEqual({ seriesIds: 'validation.duplicate' })
    const input = rowFormToInput({ ...manual, seriesIds: [SERIES_A] })
    expect(input).toMatchObject({ type: 'MANUAL', genre: null, seriesIds: [SERIES_A] })
    expect(rowFormToInput({ ...genre, genre: 'romance', seriesIds: [SERIES_A] })).toMatchObject({
      genre: 'romance',
      seriesIds: [],
    })

    expect(rowTitleFor({ fr: 'Tendances', en: 'Trending' }, 'en')).toBe('Trending')
    expect(rowTitleFor({ fr: 'Tendances', en: '' }, 'es')).toBe('Tendances')
  })
})

describe('featured helpers (B-05) — preview mapping', () => {
  const summary = {
    id: SERIES_A,
    slug: 'le-prince-oublie',
    title: 'Le Prince oublié',
    genres: ['romance'],
    posterVerticalUrl: 'https://cdn/v.jpg',
    posterHorizontalUrl: 'https://cdn/h.jpg',
    episodeCount: 4,
    freeEpisodeCount: 5,
    coinCostPerEpisode: 30,
    ageRating: 'PG12' as const,
    publishedAt: '2026-10-01T08:00:00.000Z',
  }

  it('accepts banners as series summaries (v1 backend) and as curated banners (addendum)', () => {
    const raw: PublicHomeResponse = {
      banners: [
        summary,
        {
          id: 'bnr_1',
          seriesId: SERIES_A,
          imageUrl: 'https://cdn/banner.jpg',
          title: 'À la une',
          subtitle: 'Ce soir',
          series: summary,
        },
      ],
      rows: [
        { key: 'trending', title: 'Tendances', items: [{ series: summary }] },
        { key: 'genre:romance', title: 'Romance', type: 'GENRE', items: [] },
      ],
    }
    const model = normalizeHomePreview(raw)
    expect(model.banners[0]).toMatchObject({
      id: SERIES_A,
      title: 'Le Prince oublié',
      imageUrl: 'https://cdn/h.jpg',
      subtitle: null,
    })
    expect(model.banners[0]?.series?.slug).toBe('le-prince-oublie')
    expect(model.banners[1]).toMatchObject({
      id: 'bnr_1',
      title: 'À la une',
      subtitle: 'Ce soir',
      imageUrl: 'https://cdn/banner.jpg',
    })
    expect(model.rows[0]).toMatchObject({ key: 'trending', type: 'TRENDING' })
    expect(model.rows[0]?.items[0]?.title).toBe('Le Prince oublié')
    expect(model.rows[1]?.type).toBe('GENRE')
    expect(normalizeHomePreview(null)).toEqual({ banners: [], rows: [] })
  })

  it('infers row types from public keys', () => {
    expect(inferRowType('new')).toBe('NEW')
    expect(inferRowType('continue_watching')).toBe('CONTINUE_WATCHING')
    expect(inferRowType('manual-picks')).toBe('MANUAL')
    expect(inferRowType('genre-romance')).toBe('GENRE')
    expect(inferRowType('whatever')).toBeNull()
  })
})

describe('mock home curation API', () => {
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

  it('creates, reorders, updates and deletes banners and rows, and reflects them in the preview', async () => {
    await signIn('editor@drama.local')
    const api = useFeaturedApi()

    const banners = await api.listBanners()
    expect(banners.map((b) => b.position)).toEqual([1, 2, 3])

    const created = await api.createBanner({
      seriesId: SERIES_B,
      imageUrl: 'https://cdn/new.jpg',
      title: 'Nouvelle bannière',
      subtitle: null,
      countries: ['TG'],
      isActive: true,
      startsAt: null,
      endsAt: null,
    })
    expect(created.position).toBe(4)
    await expect(api.createBanner({ title: 'Sans série' })).rejects.toMatchObject({ status: 400 })
    await expect(
      api.createBanner({ seriesId: SERIES_B, title: 'x', countries: ['France'] }),
    ).rejects.toMatchObject({ status: 400 })

    const reordered = await api.reorderBanners([created.id, ...banners.map((b) => b.id)])
    expect(reordered[0]?.id).toBe(created.id)
    expect(reordered.map((b) => b.position)).toEqual([1, 2, 3, 4])
    await expect(api.reorderBanners([created.id])).rejects.toMatchObject({ status: 400 })

    const togo = await api.preview({ country: 'TG', lang: 'fr' })
    expect(togo.banners.map((b) => b.title)).toContain('Nouvelle bannière')
    // CI-only banner is not shown in Togo; the archived series' banner is inactive anyway.
    expect(togo.banners.map((b) => b.title)).not.toContain('Mariage sous contrat')
    const ivory = await api.preview({ country: 'CI', lang: 'en' })
    expect(ivory.banners.map((b) => b.title)).toContain('Mariage sous contrat')
    expect(ivory.rows.find((row) => row.key === 'trending')?.title).toBe('Trending')
    // The manual row is restricted to FR/BE/CH.
    expect(ivory.rows.some((row) => row.key === 'selection-de-la-redaction')).toBe(false)
    const france = await api.preview({ country: 'FR', lang: 'fr' })
    const manual = france.rows.find((row) => row.key === 'selection-de-la-redaction')
    expect(manual?.items.map((item) => item.series.id)).toEqual([SERIES_B, SERIES_A])

    const deactivated = await api.updateBanner(created.id, { isActive: false })
    expect(deactivated.isActive).toBe(false)
    expect(
      (await api.preview({ country: 'TG', lang: 'fr' })).banners.map((b) => b.title),
    ).not.toContain('Nouvelle bannière')
    await api.deleteBanner(created.id)
    expect((await api.listBanners()).map((b) => b.position)).toEqual([1, 2, 3])

    const rows = await api.listRows()
    const row = await api.createRow({
      key: 'genre-thriller',
      type: 'GENRE',
      titles: { fr: 'Thrillers', en: 'Thrillers', es: '', pt: '' },
      genre: 'thriller',
      countries: [],
      isActive: true,
    })
    expect(row.key).toBe('genre-thriller')
    await expect(
      api.createRow({ key: 'genre-thriller', type: 'NEW', titles: { fr: 'Doublon' } }),
    ).rejects.toMatchObject({ status: 409 })
    await expect(
      api.createRow({ key: 'Bad:Key', type: 'NEW', titles: { fr: 'Clé' } }),
    ).rejects.toMatchObject({ status: 400 })
    expect(row.position).toBe(rows.length + 1)
    await expect(
      api.createRow({ type: 'MANUAL', titles: { fr: 'Vide', en: '', es: '', pt: '' } }),
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      api.createRow({ type: 'GENRE', titles: { fr: 'Genre ?', en: '', es: '', pt: '' } }),
    ).rejects.toMatchObject({ status: 400 })

    const switched = await api.updateRow(row.id, {
      type: 'MANUAL',
      seriesIds: [SERIES_A],
      key: 'thrillers',
    })
    expect(switched.genre).toBeNull()
    expect(switched.key).toBe('thrillers')
    const reorderedRows = await api.reorderRows([row.id, ...rows.map((r) => r.id)])
    expect(reorderedRows[0]?.id).toBe(row.id)
    await api.deleteRow(row.id)
    expect((await api.listRows()).map((r) => r.position)).toEqual(rows.map((_r, i) => i + 1))
  })

  it('lets SUPPORT read but not write', async () => {
    await signIn('support@drama.local')
    const api = useFeaturedApi()
    await expect(api.listBanners()).resolves.toBeTruthy()
    await expect(api.preview({ country: 'FR', lang: 'fr' })).resolves.toBeTruthy()
    await expect(api.createBanner({ seriesId: SERIES_A, title: 'Non' })).rejects.toMatchObject({
      status: 403,
    })
    await expect(api.reorderRows([])).rejects.toMatchObject({ status: 403 })
  })
})
