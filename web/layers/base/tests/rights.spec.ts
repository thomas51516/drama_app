import { describe, expect, it } from 'vitest'
import type { RightsContract, RightsContractListItem } from '../types/api'
import {
  canManageRights,
  decorateRenewalRows,
  emptyRightsContractForm,
  needsAttention,
  rightsContractToForm,
  rightsContractToInput,
  rightsStatusSeverity,
  validateRightsContractForm,
} from '../utils/rights'

function contract(partial: Partial<RightsContract> = {}): RightsContract {
  return {
    id: 'c1',
    seriesId: 's1',
    rightsHolder: 'Le client',
    territories: [],
    licenseStartsAt: '2026-01-01T00:00:00.000Z',
    licenseEndsAt: null,
    notes: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  }
}

describe('rights — roles', () => {
  it('only MONETIZATION and ADMIN can manage contracts', () => {
    expect(canManageRights('MONETIZATION')).toBe(true)
    expect(canManageRights('ADMIN')).toBe(true)
    expect(canManageRights('EDITOR')).toBe(false)
    expect(canManageRights('SUPPORT')).toBe(false)
    expect(canManageRights(null)).toBe(false)
  })
})

describe('rights — form validation', () => {
  it('requires a rights holder and a start date', () => {
    const errors = validateRightsContractForm(emptyRightsContractForm())
    expect(errors.rightsHolder).toBe('validation.required')
    expect(errors.licenseStartsAt).toBe('validation.required')
  })

  it('rejects an end date on or before the start date', () => {
    const errors = validateRightsContractForm({
      rightsHolder: 'X',
      territories: [],
      licenseStartsAt: '2026-06-01T00:00:00.000Z',
      licenseEndsAt: '2026-01-01T00:00:00.000Z',
      notes: '',
    })
    expect(errors.licenseEndsAt).toBe('validation.dateRange')
  })

  it('accepts a valid form with no end date (indefinite)', () => {
    const errors = validateRightsContractForm({
      rightsHolder: 'Le client',
      territories: ['TG'],
      licenseStartsAt: '2026-01-01T00:00:00.000Z',
      licenseEndsAt: null,
      notes: '',
    })
    expect(errors).toEqual({})
  })
})

describe('rights — form <-> contract conversion', () => {
  it('round-trips a contract through the form', () => {
    const c = contract({ rightsHolder: 'Studio X', territories: ['TG', 'CI'], notes: 'Détails' })
    expect(rightsContractToForm(c)).toEqual({
      rightsHolder: 'Studio X',
      territories: ['TG', 'CI'],
      licenseStartsAt: c.licenseStartsAt,
      licenseEndsAt: null,
      notes: 'Détails',
    })
  })

  it('create: sends the full payload, trimmed', () => {
    const input = rightsContractToInput({
      rightsHolder: '  Le client  ',
      territories: [],
      licenseStartsAt: '2026-01-01T00:00:00.000Z',
      licenseEndsAt: null,
      notes: '  ',
    })
    expect(input).toEqual({
      rightsHolder: 'Le client',
      territories: [],
      licenseStartsAt: '2026-01-01T00:00:00.000Z',
      licenseEndsAt: null,
      notes: null,
    })
  })

  it('edit: only the changed fields are sent', () => {
    const existing = contract()
    const patch = rightsContractToInput(
      {
        rightsHolder: existing.rightsHolder,
        territories: existing.territories,
        licenseStartsAt: existing.licenseStartsAt,
        licenseEndsAt: existing.licenseEndsAt,
        notes: 'Nouvelle note',
      },
      existing,
    )
    expect(patch).toEqual({ notes: 'Nouvelle note' })
  })

  it('edit: an unchanged form produces an empty patch', () => {
    const existing = contract()
    const patch = rightsContractToInput(rightsContractToForm(existing), existing)
    expect(patch).toEqual({})
  })
})

describe('rights — status severity', () => {
  it('maps NONE/ACTIVE/EXPIRED to the neutral/success/danger severities', () => {
    expect(rightsStatusSeverity('NONE')).toBe('secondary')
    expect(rightsStatusSeverity('ACTIVE')).toBe('success')
    expect(rightsStatusSeverity('EXPIRED')).toBe('danger')
  })
})

describe('rights — renewal list derivations', () => {
  const now = new Date('2026-10-31T00:00:00.000Z')

  function row(partial: Partial<RightsContractListItem>): RightsContractListItem {
    return {
      seriesId: 's1',
      seriesTitle: 'Série',
      seriesStatus: 'PUBLISHED',
      rightsStatus: 'NONE',
      contract: null,
      ...partial,
    }
  }

  it('needsAttention: NONE and EXPIRED always need attention', () => {
    expect(needsAttention(row({ rightsStatus: 'NONE' }), 30, now)).toBe(true)
    expect(needsAttention(row({ rightsStatus: 'EXPIRED' }), 30, now)).toBe(true)
  })

  it('needsAttention: ACTIVE needs attention only if ending inside the window', () => {
    const endingSoon = row({
      rightsStatus: 'ACTIVE',
      contract: contract({ licenseEndsAt: '2026-11-05T00:00:00.000Z' }),
    })
    const endingLater = row({
      rightsStatus: 'ACTIVE',
      contract: contract({ licenseEndsAt: '2030-01-01T00:00:00.000Z' }),
    })
    const indefinite = row({ rightsStatus: 'ACTIVE', contract: contract({ licenseEndsAt: null }) })
    expect(needsAttention(endingSoon, 10, now)).toBe(true)
    expect(needsAttention(endingLater, 10, now)).toBe(false)
    expect(needsAttention(indefinite, 10, now)).toBe(false)
  })

  it('decorateRenewalRows sorts NONE, then EXPIRED, then ACTIVE by closest end date', () => {
    const items: RightsContractListItem[] = [
      row({
        seriesId: 'active-far',
        rightsStatus: 'ACTIVE',
        contract: contract({ licenseEndsAt: '2030-01-01T00:00:00.000Z' }),
      }),
      row({ seriesId: 'none', rightsStatus: 'NONE' }),
      row({
        seriesId: 'active-soon',
        rightsStatus: 'ACTIVE',
        contract: contract({ licenseEndsAt: '2026-11-05T00:00:00.000Z' }),
      }),
      row({
        seriesId: 'expired',
        rightsStatus: 'EXPIRED',
        contract: contract({ licenseEndsAt: '2026-10-01T00:00:00.000Z' }),
      }),
      row({
        seriesId: 'active-indefinite',
        rightsStatus: 'ACTIVE',
        contract: contract({ licenseEndsAt: null }),
      }),
    ]
    const sorted = decorateRenewalRows(items, now).map((row) => row.seriesId)
    expect(sorted).toEqual(['none', 'expired', 'active-soon', 'active-far', 'active-indefinite'])
  })
})
