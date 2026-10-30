import {
  AGE_RATINGS,
  MONETIZATION_FIELDS,
  SERIES_GENRES,
  SERIES_LANGUAGES,
  type AdminRole,
  type AdminSeries,
  type AdminSeriesInput,
  type AdminSeriesUpdateInput,
  type AgeRating,
} from '../types/api'
import { isIsoCountryCode, normalizeCountryCode } from './countries'

/**
 * Series form model and validation (B-01). Pure functions so they are unit-testable; the page
 * translates the returned `validation.*` keys with vue-i18n (French first).
 */

export interface SeriesFormValues {
  title: string
  synopsis: string
  genres: string[]
  tags: string[]
  language: string
  ageRating: AgeRating
  posterVerticalUrl: string | null
  posterHorizontalUrl: string | null
  freeEpisodeCount: number | null
  coinCostPerEpisode: number | null
  /** Rewarded-ad unlocks allowed on this series (contract v1.5, default true). */
  adUnlockEnabled: boolean
  territories: string[]
  /** Scheduled publication (ISO, UTC) — B-04. `null` = publish manually. */
  publishedAt: string | null
}

export type SeriesFormField = keyof SeriesFormValues

export interface FieldError {
  key: string
  params?: Record<string, string | number>
}

export type SeriesFormErrors = Partial<Record<SeriesFormField, FieldError>>

export const SERIES_LIMITS = {
  titleMin: 2,
  titleMax: 120,
  synopsisMax: 2000,
  tagsMax: 20,
  tagMax: 30,
  freeEpisodesMax: 500,
  coinCostMax: 10_000,
} as const

export function emptySeriesForm(): SeriesFormValues {
  return {
    title: '',
    synopsis: '',
    genres: [],
    tags: [],
    language: 'fr',
    ageRating: 'ALL',
    posterVerticalUrl: null,
    posterHorizontalUrl: null,
    freeEpisodeCount: 0,
    coinCostPerEpisode: 0,
    adUnlockEnabled: true,
    territories: [],
    publishedAt: null,
  }
}

export function seriesToForm(series: AdminSeries): SeriesFormValues {
  return {
    title: series.title,
    synopsis: series.synopsis,
    genres: [...series.genres],
    tags: [...series.tags],
    language: series.language,
    ageRating: series.ageRating,
    posterVerticalUrl: series.posterVerticalUrl,
    posterHorizontalUrl: series.posterHorizontalUrl,
    freeEpisodeCount: series.freeEpisodeCount,
    coinCostPerEpisode: series.coinCostPerEpisode,
    adUnlockEnabled: series.adUnlockEnabled ?? true,
    territories: [...series.territories],
    publishedAt: series.publishedAt,
  }
}

/** Roles allowed to create/edit catalogue fields (contract: EDITOR and ADMIN). */
export function canEditCatalogue(role: AdminRole | null | undefined): boolean {
  return role === 'EDITOR' || role === 'ADMIN'
}

/** Roles allowed to change `freeEpisodeCount`, `coinCostPerEpisode` and `adUnlockEnabled`. */
export function canEditMonetization(role: AdminRole | null | undefined): boolean {
  return role === 'MONETIZATION' || role === 'ADMIN'
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value)
}

export function validateSeriesForm(values: SeriesFormValues): SeriesFormErrors {
  const errors: SeriesFormErrors = {}
  const title = values.title.trim()

  if (!title) {
    errors.title = { key: 'validation.required' }
  } else if (title.length < SERIES_LIMITS.titleMin) {
    errors.title = { key: 'validation.minLength', params: { min: SERIES_LIMITS.titleMin } }
  } else if (title.length > SERIES_LIMITS.titleMax) {
    errors.title = { key: 'validation.maxLength', params: { max: SERIES_LIMITS.titleMax } }
  }

  if (!values.synopsis.trim()) {
    errors.synopsis = { key: 'validation.required' }
  } else if (values.synopsis.length > SERIES_LIMITS.synopsisMax) {
    errors.synopsis = { key: 'validation.maxLength', params: { max: SERIES_LIMITS.synopsisMax } }
  }

  if (values.genres.length === 0) {
    errors.genres = { key: 'validation.atLeastOne' }
  } else if (values.genres.some((genre) => !(SERIES_GENRES as readonly string[]).includes(genre))) {
    errors.genres = { key: 'validation.unknownValue' }
  }

  if (values.tags.length > SERIES_LIMITS.tagsMax) {
    errors.tags = { key: 'validation.maxItems', params: { max: SERIES_LIMITS.tagsMax } }
  } else if (values.tags.some((tag) => !tag.trim() || tag.length > SERIES_LIMITS.tagMax)) {
    errors.tags = { key: 'validation.tagLength', params: { max: SERIES_LIMITS.tagMax } }
  }

  if (!(SERIES_LANGUAGES as readonly string[]).includes(values.language)) {
    errors.language = { key: 'validation.required' }
  }

  if (!AGE_RATINGS.includes(values.ageRating)) {
    errors.ageRating = { key: 'validation.required' }
  }

  if (!isInteger(values.freeEpisodeCount) || values.freeEpisodeCount < 0) {
    errors.freeEpisodeCount = { key: 'validation.nonNegativeInteger' }
  } else if (values.freeEpisodeCount > SERIES_LIMITS.freeEpisodesMax) {
    errors.freeEpisodeCount = {
      key: 'validation.max',
      params: { max: SERIES_LIMITS.freeEpisodesMax },
    }
  }

  if (!isInteger(values.coinCostPerEpisode) || values.coinCostPerEpisode < 0) {
    errors.coinCostPerEpisode = { key: 'validation.nonNegativeInteger' }
  } else if (values.coinCostPerEpisode > SERIES_LIMITS.coinCostMax) {
    errors.coinCostPerEpisode = {
      key: 'validation.max',
      params: { max: SERIES_LIMITS.coinCostMax },
    }
  }

  if (values.publishedAt !== null && Number.isNaN(new Date(values.publishedAt).getTime())) {
    errors.publishedAt = { key: 'validation.invalidDate' }
  }

  const invalidTerritory = values.territories.find((code) => !isIsoCountryCode(code))
  if (invalidTerritory !== undefined) {
    errors.territories = { key: 'validation.isoCountry', params: { value: invalidTerritory } }
  } else if (new Set(values.territories).size !== values.territories.length) {
    errors.territories = { key: 'validation.duplicate' }
  }

  return errors
}

export function isSeriesFormValid(values: SeriesFormValues): boolean {
  return Object.keys(validateSeriesForm(values)).length === 0
}

/**
 * Payload for POST/PATCH. Monetisation fields are omitted unless the role may change them, so a
 * forbidden field is never sent (and never triggers a 403 on an otherwise valid save).
 */
export function seriesFormToInput(
  values: SeriesFormValues,
  options: { includeMonetization: boolean },
): Partial<AdminSeriesInput> {
  const input: Partial<AdminSeriesInput> = {
    title: values.title.trim(),
    synopsis: values.synopsis.trim(),
    genres: [...values.genres],
    tags: values.tags.map((tag) => tag.trim()).filter(Boolean),
    language: values.language,
    ageRating: values.ageRating,
    posterVerticalUrl: values.posterVerticalUrl,
    posterHorizontalUrl: values.posterHorizontalUrl,
    territories: values.territories.map(normalizeCountryCode),
  }
  if (options.includeMonetization) {
    input.freeEpisodeCount = values.freeEpisodeCount ?? 0
    input.coinCostPerEpisode = values.coinCostPerEpisode ?? 0
    input.adUnlockEnabled = values.adUnlockEnabled
  }
  return input
}

/**
 * Only the fields that differ from the loaded series (PATCH stays minimal). The scheduled
 * `publishedAt` (B-04) is compared as an instant so a re-serialised equal date is not a change.
 */
export function seriesFormDiff(
  values: SeriesFormValues,
  original: AdminSeries,
  options: { includeMonetization: boolean },
): AdminSeriesUpdateInput {
  const full = seriesFormToInput(values, options)
  const diff: AdminSeriesUpdateInput = {}
  for (const key of Object.keys(full) as (keyof AdminSeriesInput)[]) {
    const next = full[key]
    // Older payloads omit `adUnlockEnabled`: the contract default is true.
    const previous = key === 'adUnlockEnabled' ? (original.adUnlockEnabled ?? true) : original[key]
    const changed = Array.isArray(next)
      ? JSON.stringify(next) !== JSON.stringify(previous)
      : next !== previous
    if (changed) (diff as Record<string, unknown>)[key] = next
  }
  if (!sameInstant(values.publishedAt, original.publishedAt)) {
    diff.publishedAt = values.publishedAt ? new Date(values.publishedAt).toISOString() : null
  }
  return diff
}

function sameInstant(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b
  return new Date(a).getTime() === new Date(b).getTime()
}

export function isMonetizationField(field: string): boolean {
  return (MONETIZATION_FIELDS as readonly string[]).includes(field)
}
