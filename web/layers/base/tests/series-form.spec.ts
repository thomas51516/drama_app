import { describe, expect, it } from 'vitest'
import type { AdminSeries } from '../types/api'
import {
  canEditCatalogue,
  canEditMonetization,
  emptySeriesForm,
  isSeriesFormValid,
  seriesFormDiff,
  seriesFormToInput,
  seriesToForm,
  validateSeriesForm,
  type SeriesFormValues,
} from '../utils/series-form'
import seriesFixture from '../mocks/series.json'
import fr from '../i18n/locales/fr.json'

function validForm(): SeriesFormValues {
  return {
    ...emptySeriesForm(),
    title: 'Le Prince oublié',
    synopsis: 'Un héritier amnésique…',
    genres: ['romance', 'drame'],
    tags: ['héritier'],
    territories: ['FR', 'CI'],
    freeEpisodeCount: 5,
    coinCostPerEpisode: 30,
  }
}

describe('series form validation', () => {
  it('accepts a complete form', () => {
    expect(validateSeriesForm(validForm())).toEqual({})
    expect(isSeriesFormValid(validForm())).toBe(true)
  })

  it('requires title, synopsis and at least one genre on an empty form', () => {
    const errors = validateSeriesForm(emptySeriesForm())
    expect(errors.title).toEqual({ key: 'validation.required' })
    expect(errors.synopsis).toEqual({ key: 'validation.required' })
    expect(errors.genres).toEqual({ key: 'validation.atLeastOne' })
    expect(errors.language).toBeUndefined()
    expect(errors.freeEpisodeCount).toBeUndefined()
  })

  it('enforces title length bounds', () => {
    expect(validateSeriesForm({ ...validForm(), title: 'A' }).title).toEqual({
      key: 'validation.minLength',
      params: { min: 2 },
    })
    expect(validateSeriesForm({ ...validForm(), title: 'x'.repeat(121) }).title).toEqual({
      key: 'validation.maxLength',
      params: { max: 120 },
    })
  })

  it('rejects unknown genres, languages and ratings', () => {
    expect(validateSeriesForm({ ...validForm(), genres: ['western'] }).genres?.key).toBe(
      'validation.unknownValue',
    )
    expect(validateSeriesForm({ ...validForm(), language: 'de' }).language?.key).toBe(
      'validation.required',
    )
    expect(
      validateSeriesForm({ ...validForm(), ageRating: 'PG13' as SeriesFormValues['ageRating'] })
        .ageRating?.key,
    ).toBe('validation.required')
  })

  it('validates monetisation fields as non-negative bounded integers', () => {
    expect(validateSeriesForm({ ...validForm(), freeEpisodeCount: -1 }).freeEpisodeCount?.key).toBe(
      'validation.nonNegativeInteger',
    )
    expect(
      validateSeriesForm({ ...validForm(), freeEpisodeCount: null }).freeEpisodeCount?.key,
    ).toBe('validation.nonNegativeInteger')
    expect(
      validateSeriesForm({ ...validForm(), coinCostPerEpisode: 2.5 }).coinCostPerEpisode?.key,
    ).toBe('validation.nonNegativeInteger')
    expect(
      validateSeriesForm({ ...validForm(), coinCostPerEpisode: 10_001 }).coinCostPerEpisode,
    ).toEqual({ key: 'validation.max', params: { max: 10_000 } })
  })

  it('validates territories as unique ISO alpha-2 codes', () => {
    expect(
      validateSeriesForm({ ...validForm(), territories: ['FR', 'France'] }).territories,
    ).toEqual({
      key: 'validation.isoCountry',
      params: { value: 'France' },
    })
    expect(validateSeriesForm({ ...validForm(), territories: ['FR', 'FR'] }).territories?.key).toBe(
      'validation.duplicate',
    )
  })

  it('limits tags count and length', () => {
    expect(
      validateSeriesForm({ ...validForm(), tags: Array.from({ length: 21 }, (_, i) => `t${i}`) })
        .tags?.key,
    ).toBe('validation.maxItems')
    expect(validateSeriesForm({ ...validForm(), tags: ['x'.repeat(31)] }).tags?.key).toBe(
      'validation.tagLength',
    )
  })

  it('has a French message for every validation key it can emit', () => {
    const keys = [
      'required',
      'minLength',
      'maxLength',
      'atLeastOne',
      'unknownValue',
      'maxItems',
      'tagLength',
      'nonNegativeInteger',
      'max',
      'isoCountry',
      'duplicate',
      'fixErrors',
    ]
    for (const key of keys) {
      expect(fr.validation[key as keyof typeof fr.validation]).toBeTruthy()
    }
  })
})

describe('series form payloads and roles', () => {
  const original = seriesFixture[0] as AdminSeries

  it('round-trips a series into form values', () => {
    const form = seriesToForm(original)
    expect(form.title).toBe(original.title)
    expect(form.genres).toEqual(original.genres)
    expect(form.genres).not.toBe(original.genres)
  })

  it('omits monetisation fields when the role may not change them', () => {
    const input = seriesFormToInput(validForm(), { includeMonetization: false })
    expect(input).not.toHaveProperty('freeEpisodeCount')
    expect(input).not.toHaveProperty('coinCostPerEpisode')
    const full = seriesFormToInput(validForm(), { includeMonetization: true })
    expect(full.freeEpisodeCount).toBe(5)
    expect(full.coinCostPerEpisode).toBe(30)
    expect(full.territories).toEqual(['FR', 'CI'])
  })

  it('computes a minimal PATCH diff', () => {
    const form = seriesToForm(original)
    expect(seriesFormDiff(form, original, { includeMonetization: true })).toEqual({})
    form.title = 'Nouveau titre'
    form.territories = [...form.territories, 'BE']
    form.coinCostPerEpisode = 40
    expect(seriesFormDiff(form, original, { includeMonetization: true })).toEqual({
      title: 'Nouveau titre',
      territories: [...original.territories, 'BE'],
      coinCostPerEpisode: 40,
    })
    expect(seriesFormDiff(form, original, { includeMonetization: false })).toEqual({
      title: 'Nouveau titre',
      territories: [...original.territories, 'BE'],
    })
  })

  it('maps roles to permissions as in the contract', () => {
    expect(canEditCatalogue('EDITOR')).toBe(true)
    expect(canEditCatalogue('ADMIN')).toBe(true)
    expect(canEditCatalogue('MONETIZATION')).toBe(false)
    expect(canEditCatalogue('SUPPORT')).toBe(false)
    expect(canEditMonetization('MONETIZATION')).toBe(true)
    expect(canEditMonetization('ADMIN')).toBe(true)
    expect(canEditMonetization('EDITOR')).toBe(false)
    expect(canEditMonetization(null)).toBe(false)
  })
})
