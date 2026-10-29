import type {
  HomeBanner,
  HomeBannerInput,
  HomeRow,
  HomeRowInput,
  HomeRowTitles,
  HomeRowType,
  HomeTitleLanguage,
  PublicHomeBanner,
  PublicHomeResponse,
  PublicHomeRow,
  PublicSeriesSummary,
} from '../types/api'
import { HOME_ROW_KEY_RE, HOME_ROW_TYPES, HOME_TITLE_LANGUAGES, SERIES_GENRES } from '../types/api'
import { isIsoCountryCode } from './countries'

/**
 * Pure helpers of the home curation module (B-05): ordering, banner/row forms and validation,
 * and the normalisation of the public `/home` payload rendered by the preview panel.
 */

// ---------------------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------------------

/** Move an item inside a list (drag-and-drop), returning a new array. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list]
  if (from < 0 || from >= next.length || to < 0 || to >= next.length || from === to) return next
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item as T)
  return next
}

/** Reassign `position` 1..n following the array order (optimistic update before the PUT). */
export function withPositions<T extends { position: number }>(list: readonly T[]): T[] {
  return list.map((item, index) => ({ ...item, position: index + 1 }))
}

export function sortByPosition<T extends { position: number }>(list: readonly T[]): T[] {
  return [...list].sort((a, b) => a.position - b.position)
}

export function orderIds<T extends { id: string }>(list: readonly T[]): string[] {
  return list.map((item) => item.id)
}

// ---------------------------------------------------------------------------
// Banners
// ---------------------------------------------------------------------------

export interface BannerFormValues {
  seriesId: string | null
  imageUrl: string | null
  title: string
  subtitle: string
  countries: string[]
  isActive: boolean
  startsAt: Date | null
  endsAt: Date | null
}

export type BannerFormErrors = Partial<Record<keyof BannerFormValues, string>>

export const BANNER_TITLE_MAX = 80
export const BANNER_SUBTITLE_MAX = 140

export function emptyBannerForm(): BannerFormValues {
  return {
    seriesId: null,
    imageUrl: null,
    title: '',
    subtitle: '',
    countries: [],
    isActive: true,
    startsAt: null,
    endsAt: null,
  }
}

export function bannerToForm(banner: HomeBanner): BannerFormValues {
  return {
    seriesId: banner.seriesId,
    imageUrl: banner.imageUrl,
    title: banner.title,
    subtitle: banner.subtitle ?? '',
    countries: [...banner.countries],
    isActive: banner.isActive,
    startsAt: banner.startsAt ? new Date(banner.startsAt) : null,
    endsAt: banner.endsAt ? new Date(banner.endsAt) : null,
  }
}

/** Error values are i18n keys of `validation.*` (with optional params in `*Params`). */
export function validateBannerForm(values: BannerFormValues): BannerFormErrors {
  const errors: BannerFormErrors = {}
  if (!values.seriesId) errors.seriesId = 'validation.required'
  const title = values.title.trim()
  if (!title) errors.title = 'validation.required'
  else if (title.length > BANNER_TITLE_MAX) errors.title = 'validation.maxLength'
  if (values.subtitle.trim().length > BANNER_SUBTITLE_MAX) errors.subtitle = 'validation.maxLength'
  if (!values.imageUrl) errors.imageUrl = 'validation.required'
  if (values.countries.some((code) => !isIsoCountryCode(code))) {
    errors.countries = 'validation.isoCountry'
  }
  if (values.startsAt && values.endsAt && values.endsAt.getTime() < values.startsAt.getTime()) {
    errors.endsAt = 'validation.dateRange'
  }
  return errors
}

export function bannerFormToInput(values: BannerFormValues): HomeBannerInput {
  return {
    seriesId: values.seriesId ?? undefined,
    imageUrl: values.imageUrl,
    title: values.title.trim(),
    subtitle: values.subtitle.trim() || null,
    countries: [...values.countries],
    isActive: values.isActive,
    startsAt: values.startsAt ? values.startsAt.toISOString() : null,
    endsAt: values.endsAt ? values.endsAt.toISOString() : null,
  }
}

export type BannerSchedule = 'inactive' | 'scheduled' | 'live' | 'expired'

/** What the app would do with the banner right now. */
export function bannerSchedule(
  banner: Pick<HomeBanner, 'isActive' | 'startsAt' | 'endsAt'>,
  now: Date = new Date(),
): BannerSchedule {
  if (!banner.isActive) return 'inactive'
  const time = now.getTime()
  if (banner.startsAt && new Date(banner.startsAt).getTime() > time) return 'scheduled'
  if (banner.endsAt && new Date(banner.endsAt).getTime() < time) return 'expired'
  return 'live'
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

/** Titles as edited in the form: every language is a string (empty = not translated). */
export type RowFormTitles = Record<HomeTitleLanguage, string>

export interface RowFormValues {
  key: string
  type: HomeRowType
  titles: RowFormTitles
  genre: string | null
  seriesIds: string[]
  countries: string[]
  isActive: boolean
}

export type RowFormErrors = Partial<
  Record<'key' | 'type' | 'titles' | 'genre' | 'seriesIds' | 'countries', string>
>

export const ROW_TITLE_MAX = 80

export function emptyRowTitles(): RowFormTitles {
  return { fr: '', en: '', es: '', pt: '' }
}

/** Slug usable as a row key: `Sélection de la rédaction` → `selection-de-la-redaction`. */
export function slugifyKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

/**
 * Key suggested from the row definition (the editor may override it): fixed keys for the
 * computed rows, `genre-<genre>` for a genre row, the slug of the French title otherwise.
 */
export function suggestRowKey(values: Pick<RowFormValues, 'type' | 'genre' | 'titles'>): string {
  switch (values.type) {
    case 'TRENDING':
      return 'trending'
    case 'NEW':
      return 'new'
    case 'CONTINUE_WATCHING':
      return 'continue_watching'
    case 'GENRE':
      return values.genre ? `genre-${slugifyKey(values.genre)}` : 'genre'
    default:
      return slugifyKey(values.titles.fr)
  }
}

export function isValidRowKey(key: string): boolean {
  return HOME_ROW_KEY_RE.test(key)
}

export function emptyRowForm(): RowFormValues {
  return {
    key: '',
    type: 'MANUAL',
    titles: emptyRowTitles(),
    genre: null,
    seriesIds: [],
    countries: [],
    isActive: true,
  }
}

export function rowToForm(row: HomeRow): RowFormValues {
  const titles = emptyRowTitles()
  for (const lang of HOME_TITLE_LANGUAGES) titles[lang] = row.titles[lang] ?? ''
  return {
    key: row.key,
    type: row.type,
    titles,
    genre: row.genre ?? null,
    seriesIds: [...(row.seriesIds ?? [])],
    countries: [...row.countries],
    isActive: row.isActive,
  }
}

export function rowNeedsGenre(type: HomeRowType): boolean {
  return type === 'GENRE'
}

export function rowNeedsSeries(type: HomeRowType): boolean {
  return type === 'MANUAL'
}

export function validateRowForm(values: RowFormValues): RowFormErrors {
  const errors: RowFormErrors = {}
  if (!values.key.trim()) errors.key = 'validation.required'
  else if (!isValidRowKey(values.key.trim())) errors.key = 'validation.rowKey'
  if (!HOME_ROW_TYPES.includes(values.type)) errors.type = 'validation.unknownValue'
  if (!values.titles.fr.trim()) errors.titles = 'validation.requiredFrench'
  else if (HOME_TITLE_LANGUAGES.some((lang) => values.titles[lang].trim().length > ROW_TITLE_MAX)) {
    errors.titles = 'validation.maxLength'
  }
  if (rowNeedsGenre(values.type)) {
    if (!values.genre) errors.genre = 'validation.required'
    else if (!(SERIES_GENRES as readonly string[]).includes(values.genre)) {
      errors.genre = 'validation.unknownValue'
    }
  }
  if (rowNeedsSeries(values.type)) {
    if (values.seriesIds.length === 0) errors.seriesIds = 'validation.atLeastOne'
    else if (new Set(values.seriesIds).size !== values.seriesIds.length) {
      errors.seriesIds = 'validation.duplicate'
    }
  }
  if (values.countries.some((code) => !isIsoCountryCode(code))) {
    errors.countries = 'validation.isoCountry'
  }
  return errors
}

/** Fields irrelevant to the type are cleared so a type change does not leave stale data behind. */
export function rowFormToInput(values: RowFormValues): HomeRowInput {
  const titles = Object.fromEntries(
    HOME_TITLE_LANGUAGES.map((lang) => [lang, values.titles[lang].trim()]),
  ) as RowFormTitles
  return {
    key: values.key.trim(),
    type: values.type,
    titles,
    genre: rowNeedsGenre(values.type) ? values.genre : null,
    seriesIds: rowNeedsSeries(values.type) ? [...values.seriesIds] : [],
    countries: [...values.countries],
    isActive: values.isActive,
  }
}

/** Title of a row in the viewer's language, falling back to French (contract). */
export function rowTitleFor(titles: Partial<HomeRowTitles>, lang: string): string {
  const value = titles[lang as keyof HomeRowTitles]
  return (value && value.trim()) || titles.fr?.trim() || ''
}

// ---------------------------------------------------------------------------
// Preview normalisation
// ---------------------------------------------------------------------------

export interface PreviewBanner {
  id: string
  title: string
  subtitle: string | null
  imageUrl: string | null
  series: PublicSeriesSummary | null
}

export interface PreviewRow {
  key: string
  title: string
  type: HomeRowType | null
  items: PublicSeriesSummary[]
}

export interface PreviewModel {
  banners: PreviewBanner[]
  rows: PreviewRow[]
}

function isSeriesSummary(value: unknown): value is PublicSeriesSummary {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as PublicSeriesSummary).title === 'string' &&
    typeof (value as PublicSeriesSummary).slug === 'string'
  )
}

/**
 * The public `/home` may send banners as series summaries (v1 of the backend) or as curated
 * banners with their series (addendum). Both are mapped to what the app shows: a 16:9 image
 * with a title and subtitle, and the target series.
 */
export function normalizeBanner(raw: PublicHomeBanner, index: number): PreviewBanner {
  const series = raw.series ?? (isSeriesSummary(raw) ? raw : null)
  return {
    id: String(raw.id ?? raw.seriesId ?? series?.id ?? `banner-${index}`),
    title: typeof raw.title === 'string' && raw.title ? raw.title : (series?.title ?? ''),
    subtitle: raw.subtitle ?? null,
    imageUrl: raw.imageUrl ?? series?.posterHorizontalUrl ?? series?.posterVerticalUrl ?? null,
    series,
  }
}

export function normalizeRow(raw: PublicHomeRow): PreviewRow {
  return {
    key: raw.key,
    title: raw.title,
    type: raw.type ?? inferRowType(raw.key),
    items: (raw.items ?? []).map((item) => item.series).filter(isSeriesSummary),
  }
}

export function inferRowType(key: string): HomeRowType | null {
  if (key === 'trending') return 'TRENDING'
  if (key === 'new') return 'NEW'
  if (key === 'continue_watching') return 'CONTINUE_WATCHING'
  if (/^genre[:_-]/.test(key)) return 'GENRE'
  if (/^manual[:_-]/.test(key)) return 'MANUAL'
  return null
}

export function normalizeHomePreview(raw: PublicHomeResponse | null | undefined): PreviewModel {
  return {
    banners: (raw?.banners ?? []).map(normalizeBanner),
    rows: (raw?.rows ?? []).map(normalizeRow),
  }
}
