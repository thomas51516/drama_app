import type {
  AdminRole,
  RightsContract,
  RightsContractInput,
  RightsContractListItem,
  RightsContractUpdateInput,
  RightsStatus,
} from '../types/api'

/**
 * Droits et contrats (B-12, sprint 9). Pure form model, validation and derivations; the page and
 * dialog only translate `validation.*` keys and render.
 */

/** Mirrors the backend role rule: write (create/update/delete) is MONETIZATION and ADMIN only. */
export function canManageRights(role: AdminRole | null | undefined): boolean {
  return role === 'MONETIZATION' || role === 'ADMIN'
}

export interface RightsContractFormValues {
  rightsHolder: string
  territories: string[]
  /** ISO UTC (converted from Lomé wall time by the component, same convention as scheduling). */
  licenseStartsAt: string | null
  licenseEndsAt: string | null
  notes: string
}

export type RightsContractErrors = Partial<
  Record<'rightsHolder' | 'licenseStartsAt' | 'licenseEndsAt', string>
>

export const RIGHTS_HOLDER_MAX = 200
export const RIGHTS_NOTES_MAX = 2000

export function emptyRightsContractForm(): RightsContractFormValues {
  return {
    rightsHolder: '',
    territories: [],
    licenseStartsAt: null,
    licenseEndsAt: null,
    notes: '',
  }
}

export function rightsContractToForm(contract: RightsContract): RightsContractFormValues {
  return {
    rightsHolder: contract.rightsHolder,
    territories: [...contract.territories],
    licenseStartsAt: contract.licenseStartsAt,
    licenseEndsAt: contract.licenseEndsAt,
    notes: contract.notes ?? '',
  }
}

export function validateRightsContractForm(form: RightsContractFormValues): RightsContractErrors {
  const errors: RightsContractErrors = {}
  const rightsHolder = form.rightsHolder.trim()
  if (!rightsHolder) errors.rightsHolder = 'validation.required'
  else if (rightsHolder.length > RIGHTS_HOLDER_MAX) errors.rightsHolder = 'validation.maxLength'

  if (!form.licenseStartsAt) errors.licenseStartsAt = 'validation.required'
  else if (Number.isNaN(new Date(form.licenseStartsAt).getTime())) {
    errors.licenseStartsAt = 'validation.invalidDate'
  }

  if (form.licenseEndsAt && Number.isNaN(new Date(form.licenseEndsAt).getTime())) {
    errors.licenseEndsAt = 'validation.invalidDate'
  }
  if (
    !errors.licenseStartsAt &&
    !errors.licenseEndsAt &&
    form.licenseStartsAt &&
    form.licenseEndsAt &&
    new Date(form.licenseEndsAt).getTime() <= new Date(form.licenseStartsAt).getTime()
  ) {
    errors.licenseEndsAt = 'validation.dateRange'
  }
  return errors
}

function sameInstant(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b
  return new Date(a).getTime() === new Date(b).getTime()
}

/** Full payload for `POST` (create); only the changed fields for `PATCH` (edit). */
export function rightsContractToInput(form: RightsContractFormValues): RightsContractInput
export function rightsContractToInput(
  form: RightsContractFormValues,
  existing: RightsContract,
): RightsContractUpdateInput
export function rightsContractToInput(
  form: RightsContractFormValues,
  existing?: RightsContract,
): RightsContractInput | RightsContractUpdateInput {
  const full: RightsContractInput = {
    rightsHolder: form.rightsHolder.trim(),
    territories: [...form.territories],
    licenseStartsAt: form.licenseStartsAt ?? new Date().toISOString(),
    licenseEndsAt: form.licenseEndsAt,
    notes: form.notes.trim() || null,
  }
  if (!existing) return full
  const patch: RightsContractUpdateInput = {}
  if (full.rightsHolder !== existing.rightsHolder) patch.rightsHolder = full.rightsHolder
  if (JSON.stringify(full.territories) !== JSON.stringify(existing.territories)) {
    patch.territories = full.territories
  }
  if (!sameInstant(form.licenseStartsAt, existing.licenseStartsAt)) {
    patch.licenseStartsAt = full.licenseStartsAt
  }
  if (!sameInstant(full.licenseEndsAt, existing.licenseEndsAt))
    patch.licenseEndsAt = full.licenseEndsAt
  if (full.notes !== existing.notes) patch.notes = full.notes
  return patch
}

/** PrimeVue `Tag` severity for a rights status (dataviz-neutral: info/success/danger). */
export function rightsStatusSeverity(status: RightsStatus): 'secondary' | 'success' | 'danger' {
  if (status === 'ACTIVE') return 'success'
  if (status === 'EXPIRED') return 'danger'
  return 'secondary'
}

export interface RightsRenewalRow extends RightsContractListItem {
  /** Days until `licenseEndsAt`, negative once past; `null` without an end date or contract. */
  daysUntilEnd: number | null
}

/** Decorates the renewal list with a sortable `daysUntilEnd`, newest-risk first. */
export function decorateRenewalRows(
  items: readonly RightsContractListItem[],
  now = new Date(),
): RightsRenewalRow[] {
  return items
    .map((item) => ({
      ...item,
      daysUntilEnd: item.contract?.licenseEndsAt
        ? Math.ceil((new Date(item.contract.licenseEndsAt).getTime() - now.getTime()) / 86_400_000)
        : null,
    }))
    .sort((a, b) => {
      const rank = (status: RightsStatus) => (status === 'NONE' ? 0 : status === 'EXPIRED' ? 1 : 2)
      const diff = rank(a.rightsStatus) - rank(b.rightsStatus)
      if (diff !== 0) return diff
      if (a.daysUntilEnd === null) return b.daysUntilEnd === null ? 0 : 1
      if (b.daysUntilEnd === null) return -1
      return a.daysUntilEnd - b.daysUntilEnd
    })
}

/** Client-side mirror of the "needs attention" filter the backend applies with `expiringWithinDays`. */
export function needsAttention(
  item: Pick<RightsContractListItem, 'rightsStatus' | 'contract'>,
  withinDays: number,
  now = new Date(),
): boolean {
  if (item.rightsStatus !== 'ACTIVE') return true
  const endsAt = item.contract?.licenseEndsAt
  if (!endsAt) return false
  const horizon = new Date(now.getTime() + withinDays * 86_400_000)
  return new Date(endsAt) <= horizon
}
