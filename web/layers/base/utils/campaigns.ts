import type {
  AdminRole,
  Campaign,
  CampaignInput,
  CampaignSegment,
  CampaignSegmentType,
  CampaignStatus,
} from '../types/api'
import {
  CAMPAIGN_BODY_MAX,
  CAMPAIGN_SEGMENT_TYPES,
  CAMPAIGN_STATUSES,
  CAMPAIGN_TITLE_MAX,
} from '../types/api'
import { isIsoCountryCode } from './countries'
import { fromPickerDate, toPickerDate } from './schedule'

/**
 * Pure helpers of the push campaigns module (B-10, contract v1.3): role gating, form values and
 * validation, segment payload mapping, deep links, status transitions and the detail timeline.
 */

// ---------------------------------------------------------------------------
// Roles and status rules
// ---------------------------------------------------------------------------

/** Campaigns are restricted to MONETIZATION and ADMIN (contract v1.3). */
export function canManageCampaigns(role: AdminRole | null | undefined): boolean {
  return role === 'MONETIZATION' || role === 'ADMIN'
}

/** A campaign can be edited (PATCH) while it has not started sending. */
export function canEditCampaign(status: CampaignStatus): boolean {
  return status === 'DRAFT' || status === 'SCHEDULED'
}

/** Only drafts can be deleted. */
export function canDeleteCampaign(status: CampaignStatus): boolean {
  return status === 'DRAFT'
}

/** `POST /send` applies to drafts (immediate or at `scheduledAt`). */
export function canSendCampaign(status: CampaignStatus): boolean {
  return status === 'DRAFT'
}

/** `POST /cancel` applies to scheduled campaigns only. */
export function canCancelCampaign(status: CampaignStatus): boolean {
  return status === 'SCHEDULED'
}

export function campaignStatusSeverity(
  status: CampaignStatus,
): 'secondary' | 'info' | 'warn' | 'success' | 'danger' {
  switch (status) {
    case 'DRAFT':
      return 'secondary'
    case 'SCHEDULED':
      return 'info'
    case 'SENDING':
      return 'warn'
    case 'SENT':
      return 'success'
    case 'CANCELLED':
      return 'danger'
  }
}

/** Status reached after `POST /send`: scheduled when the date is in the future, sending now. */
export function statusAfterSend(scheduledAt: string | null, nowMs = Date.now()): CampaignStatus {
  if (scheduledAt && new Date(scheduledAt).getTime() > nowMs) return 'SCHEDULED'
  return 'SENDING'
}

// ---------------------------------------------------------------------------
// Deep links
// ---------------------------------------------------------------------------

export const DEEP_LINK_SCHEME = 'drama://'
export const DEEP_LINK_RE = /^drama:\/\/[a-z0-9_-]+(\/[A-Za-z0-9_.~-]+)*(\?[^\s#]*)?$/

export function seriesDeepLink(seriesId: string): string {
  return `${DEEP_LINK_SCHEME}series/${seriesId}`
}

/** Series id of a `drama://series/{id}` link, `null` for any other link. */
export function seriesIdFromDeepLink(link: string | null | undefined): string | null {
  if (!link) return null
  const match = /^drama:\/\/series\/([A-Za-z0-9_.~-]+)\/?$/.exec(link.trim())
  return match?.[1] ?? null
}

export function isValidDeepLink(link: string): boolean {
  return DEEP_LINK_RE.test(link.trim())
}

// ---------------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------------

export interface CampaignFormValues {
  title: string
  body: string
  deepLink: string
  segmentType: CampaignSegmentType
  countries: string[]
  seriesId: string | null
  inactiveDays: number | null
  /** Browser-local `Date` whose fields are Lomé wall time (see `utils/schedule.ts`). */
  scheduledAt: Date | null
}

export type CampaignFormErrors = Partial<
  Record<
    'title' | 'body' | 'deepLink' | 'segmentType' | 'countries' | 'seriesId' | 'inactiveDays',
    string
  >
>

export const INACTIVE_DAYS_MIN = 1
export const INACTIVE_DAYS_MAX = 365
export const INACTIVE_DAYS_DEFAULT = 7

export function emptyCampaignForm(): CampaignFormValues {
  return {
    title: '',
    body: '',
    deepLink: '',
    segmentType: 'ALL',
    countries: [],
    seriesId: null,
    inactiveDays: null,
    scheduledAt: null,
  }
}

export function campaignToForm(campaign: Campaign): CampaignFormValues {
  const segment = campaign.segment ?? { type: 'ALL' }
  return {
    title: campaign.title,
    body: campaign.body,
    deepLink: campaign.deepLink ?? '',
    segmentType: segment.type,
    countries: [...(segment.countries ?? [])],
    seriesId: segment.seriesId ?? null,
    inactiveDays: segment.inactiveDays ?? null,
    scheduledAt: toPickerDate(campaign.scheduledAt),
  }
}

export function segmentNeedsCountries(type: CampaignSegmentType): boolean {
  return type === 'COUNTRY'
}

export function segmentNeedsSeries(type: CampaignSegmentType): boolean {
  return type === 'SERIES_FOLLOWERS'
}

export function segmentNeedsInactiveDays(type: CampaignSegmentType): boolean {
  return type === 'INACTIVE'
}

/** Remaining characters of the push body (negative when over the limit). */
export function bodyRemaining(body: string): number {
  return CAMPAIGN_BODY_MAX - Array.from(body).length
}

export function validateCampaignForm(values: CampaignFormValues): CampaignFormErrors {
  const errors: CampaignFormErrors = {}
  const title = values.title.trim()
  if (!title) errors.title = 'validation.required'
  else if (Array.from(title).length > CAMPAIGN_TITLE_MAX) errors.title = 'validation.maxLength'

  const body = values.body.trim()
  if (!body) errors.body = 'validation.required'
  else if (bodyRemaining(body) < 0) errors.body = 'validation.maxLength'

  const deepLink = values.deepLink.trim()
  if (deepLink && !isValidDeepLink(deepLink)) errors.deepLink = 'validation.deepLink'

  if (!CAMPAIGN_SEGMENT_TYPES.includes(values.segmentType)) {
    errors.segmentType = 'validation.unknownValue'
  }
  if (segmentNeedsCountries(values.segmentType)) {
    if (values.countries.length === 0) errors.countries = 'validation.atLeastOne'
    else if (values.countries.some((code) => !isIsoCountryCode(code))) {
      errors.countries = 'validation.isoCountry'
    }
  }
  if (segmentNeedsSeries(values.segmentType) && !values.seriesId) {
    errors.seriesId = 'validation.required'
  }
  if (segmentNeedsInactiveDays(values.segmentType)) {
    const days = values.inactiveDays
    if (days === null || !Number.isInteger(days) || days < INACTIVE_DAYS_MIN) {
      errors.inactiveDays = 'validation.positiveInteger'
    } else if (days > INACTIVE_DAYS_MAX) {
      errors.inactiveDays = 'validation.max'
    }
  }
  return errors
}

/** Segment payload: fields irrelevant to the type are dropped so stale values never leak. */
export function segmentFromForm(
  values: Pick<CampaignFormValues, 'segmentType' | 'countries' | 'seriesId' | 'inactiveDays'>,
): CampaignSegment {
  switch (values.segmentType) {
    case 'COUNTRY':
      return { type: 'COUNTRY', countries: [...values.countries] }
    case 'SERIES_FOLLOWERS':
      return { type: 'SERIES_FOLLOWERS', seriesId: values.seriesId }
    case 'INACTIVE':
      return { type: 'INACTIVE', inactiveDays: values.inactiveDays }
    default:
      return { type: 'ALL' }
  }
}

export function campaignFormToInput(values: CampaignFormValues): CampaignInput {
  const deepLink = values.deepLink.trim()
  return {
    title: values.title.trim(),
    body: values.body.trim(),
    deepLink: deepLink || null,
    segment: segmentFromForm(values),
    scheduledAt: fromPickerDate(values.scheduledAt),
  }
}

/** Short human description of a segment, as i18n key + params (translated by the component). */
export function describeSegment(segment: CampaignSegment): {
  key: string
  params: Record<string, string | number>
} {
  switch (segment.type) {
    case 'COUNTRY':
      return {
        key: 'campaigns.segments.summary.COUNTRY',
        params: { countries: (segment.countries ?? []).join(', ') || '—' },
      }
    case 'SERIES_FOLLOWERS':
      return {
        key: 'campaigns.segments.summary.SERIES_FOLLOWERS',
        params: { series: segment.seriesId ?? '—' },
      }
    case 'INACTIVE':
      return {
        key: 'campaigns.segments.summary.INACTIVE',
        params: { days: segment.inactiveDays ?? 0 },
      }
    default:
      return { key: 'campaigns.segments.summary.ALL', params: {} }
  }
}

// ---------------------------------------------------------------------------
// Lists and timeline
// ---------------------------------------------------------------------------

export function isCampaignStatus(value: unknown): value is CampaignStatus {
  return typeof value === 'string' && (CAMPAIGN_STATUSES as readonly string[]).includes(value)
}

/** Count per status for the header tags (every status present, 0 when empty). */
export function countByStatus(campaigns: readonly Campaign[]): Record<CampaignStatus, number> {
  const counts = Object.fromEntries(CAMPAIGN_STATUSES.map((status) => [status, 0])) as Record<
    CampaignStatus,
    number
  >
  for (const campaign of campaigns) counts[campaign.status] += 1
  return counts
}

/** Newest first; scheduled campaigns sorted by their send date, the others by creation. */
export function sortCampaigns(campaigns: readonly Campaign[]): Campaign[] {
  return [...campaigns].sort((a, b) => {
    const dateA = a.sentAt ?? a.scheduledAt ?? a.createdAt
    const dateB = b.sentAt ?? b.scheduledAt ?? b.createdAt
    return new Date(dateB).getTime() - new Date(dateA).getTime()
  })
}

export interface CampaignTimelineEvent {
  /** i18n key under `campaigns.timeline.*` */
  key: 'created' | 'scheduled' | 'sending' | 'sent' | 'cancelled'
  at: string | null
  done: boolean
}

/**
 * Timeline of the detail drawer from the fields the contract guarantees (`createdAt`,
 * `scheduledAt`, `status`) plus the optional timestamps when the backend sends them.
 */
export function campaignTimeline(campaign: Campaign): CampaignTimelineEvent[] {
  const events: CampaignTimelineEvent[] = [{ key: 'created', at: campaign.createdAt, done: true }]
  const status = campaign.status
  if (campaign.scheduledAt) {
    events.push({
      key: 'scheduled',
      at: campaign.scheduledAt,
      done: status !== 'DRAFT',
    })
  }
  if (status === 'CANCELLED') {
    events.push({
      key: 'cancelled',
      at: campaign.cancelledAt ?? campaign.updatedAt ?? null,
      done: true,
    })
    return events
  }
  events.push({
    key: 'sending',
    at: status === 'SENDING' ? (campaign.updatedAt ?? null) : null,
    done: status === 'SENDING' || status === 'SENT',
  })
  events.push({ key: 'sent', at: campaign.sentAt ?? null, done: status === 'SENT' })
  return events
}

/** Delivery ratio for the detail (`null` when nothing was sent yet or no audience). */
export function deliveryRate(
  campaign: Pick<Campaign, 'audienceCount' | 'sentCount'>,
): number | null {
  if (campaign.audienceCount <= 0 || campaign.sentCount <= 0) return null
  return Math.min(1, campaign.sentCount / campaign.audienceCount)
}
