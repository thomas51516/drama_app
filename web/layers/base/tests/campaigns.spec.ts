import { describe, expect, it } from 'vitest'
import type { Campaign } from '../types/api'
import { CAMPAIGN_BODY_MAX } from '../types/api'
import {
  bodyRemaining,
  campaignFormToInput,
  campaignTimeline,
  campaignToForm,
  canCancelCampaign,
  canDeleteCampaign,
  canEditCampaign,
  canManageCampaigns,
  canSendCampaign,
  countByStatus,
  deliveryRate,
  describeSegment,
  emptyCampaignForm,
  isValidDeepLink,
  segmentFromForm,
  seriesDeepLink,
  seriesIdFromDeepLink,
  sortCampaigns,
  statusAfterSend,
  validateCampaignForm,
} from '../utils/campaigns'

function campaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: 'cmp_1',
    title: 'Titre',
    body: 'Corps',
    deepLink: null,
    segment: { type: 'ALL' },
    scheduledAt: null,
    status: 'DRAFT',
    audienceCount: 0,
    sentCount: 0,
    createdBy: 'money@drama.local',
    createdAt: '2026-10-29T08:00:00.000Z',
    ...overrides,
  }
}

describe('campaigns — roles and status rules', () => {
  it('restricts campaigns to MONETIZATION and ADMIN', () => {
    expect(canManageCampaigns('MONETIZATION')).toBe(true)
    expect(canManageCampaigns('ADMIN')).toBe(true)
    expect(canManageCampaigns('EDITOR')).toBe(false)
    expect(canManageCampaigns('SUPPORT')).toBe(false)
    expect(canManageCampaigns(null)).toBe(false)
  })

  it('maps each status to the allowed actions', () => {
    expect(canEditCampaign('DRAFT')).toBe(true)
    expect(canEditCampaign('SCHEDULED')).toBe(true)
    expect(canEditCampaign('SENDING')).toBe(false)
    expect(canEditCampaign('SENT')).toBe(false)
    expect(canDeleteCampaign('DRAFT')).toBe(true)
    expect(canDeleteCampaign('SCHEDULED')).toBe(false)
    expect(canSendCampaign('DRAFT')).toBe(true)
    expect(canSendCampaign('SCHEDULED')).toBe(false)
    expect(canCancelCampaign('SCHEDULED')).toBe(true)
    expect(canCancelCampaign('DRAFT')).toBe(false)
    expect(canCancelCampaign('SENT')).toBe(false)
  })

  it('sends now without a date or with a past date, schedules with a future date', () => {
    const now = Date.parse('2026-10-30T12:00:00.000Z')
    expect(statusAfterSend(null, now)).toBe('SENDING')
    expect(statusAfterSend('2026-10-30T11:00:00.000Z', now)).toBe('SENDING')
    expect(statusAfterSend('2026-10-31T10:00:00.000Z', now)).toBe('SCHEDULED')
  })
})

describe('campaigns — form validation and segment payload mapping', () => {
  it('requires title and body and enforces the 178-character body', () => {
    const form = emptyCampaignForm()
    expect(validateCampaignForm(form)).toMatchObject({
      title: 'validation.required',
      body: 'validation.required',
    })
    form.title = 'Nouvel épisode'
    form.body = 'a'.repeat(CAMPAIGN_BODY_MAX)
    expect(validateCampaignForm(form)).toEqual({})
    expect(bodyRemaining(form.body)).toBe(0)
    form.body = 'a'.repeat(CAMPAIGN_BODY_MAX + 1)
    expect(bodyRemaining(form.body)).toBe(-1)
    expect(validateCampaignForm(form).body).toBe('validation.maxLength')
  })

  it('counts characters, not UTF-16 code units (emoji count once)', () => {
    expect(bodyRemaining('😀')).toBe(CAMPAIGN_BODY_MAX - 1)
  })

  it('validates the optional deep link and extracts the series id', () => {
    expect(isValidDeepLink('drama://series/ser_01HZX')).toBe(true)
    expect(isValidDeepLink('drama://coins')).toBe(true)
    expect(isValidDeepLink('https://example.com')).toBe(false)
    expect(isValidDeepLink('drama://')).toBe(false)
    expect(seriesDeepLink('ser_1')).toBe('drama://series/ser_1')
    expect(seriesIdFromDeepLink('drama://series/ser_1')).toBe('ser_1')
    expect(seriesIdFromDeepLink('drama://coins')).toBeNull()
    expect(seriesIdFromDeepLink('')).toBeNull()

    const form = { ...emptyCampaignForm(), title: 'T', body: 'B', deepLink: 'http://x' }
    expect(validateCampaignForm(form).deepLink).toBe('validation.deepLink')
  })

  it('requires the conditional segment fields', () => {
    const base = { ...emptyCampaignForm(), title: 'T', body: 'B' }
    expect(validateCampaignForm({ ...base, segmentType: 'COUNTRY' }).countries).toBe(
      'validation.atLeastOne',
    )
    expect(
      validateCampaignForm({ ...base, segmentType: 'COUNTRY', countries: ['XX1'] }).countries,
    ).toBe('validation.isoCountry')
    expect(validateCampaignForm({ ...base, segmentType: 'SERIES_FOLLOWERS' }).seriesId).toBe(
      'validation.required',
    )
    expect(validateCampaignForm({ ...base, segmentType: 'INACTIVE' }).inactiveDays).toBe(
      'validation.positiveInteger',
    )
    expect(
      validateCampaignForm({ ...base, segmentType: 'INACTIVE', inactiveDays: 0 }).inactiveDays,
    ).toBe('validation.positiveInteger')
    expect(
      validateCampaignForm({ ...base, segmentType: 'INACTIVE', inactiveDays: 400 }).inactiveDays,
    ).toBe('validation.max')
    expect(validateCampaignForm({ ...base, segmentType: 'INACTIVE', inactiveDays: 14 })).toEqual({})
  })

  it('maps the segment payload and drops the fields of other types', () => {
    const stale = {
      countries: ['TG', 'CI'],
      seriesId: 'ser_1',
      inactiveDays: 30,
    }
    expect(segmentFromForm({ segmentType: 'ALL', ...stale })).toEqual({ type: 'ALL' })
    expect(segmentFromForm({ segmentType: 'COUNTRY', ...stale })).toEqual({
      type: 'COUNTRY',
      countries: ['TG', 'CI'],
    })
    expect(segmentFromForm({ segmentType: 'SERIES_FOLLOWERS', ...stale })).toEqual({
      type: 'SERIES_FOLLOWERS',
      seriesId: 'ser_1',
    })
    expect(segmentFromForm({ segmentType: 'INACTIVE', ...stale })).toEqual({
      type: 'INACTIVE',
      inactiveDays: 30,
    })
  })

  it('converts the form to the contract input, with the schedule in Lomé time → UTC', () => {
    const form = {
      ...emptyCampaignForm(),
      title: '  Titre  ',
      body: ' Corps ',
      deepLink: ' drama://series/ser_1 ',
      segmentType: 'COUNTRY' as const,
      countries: ['TG'],
      scheduledAt: new Date(2026, 10, 3, 18, 0, 0, 0),
    }
    const input = campaignFormToInput(form)
    expect(input).toEqual({
      title: 'Titre',
      body: 'Corps',
      deepLink: 'drama://series/ser_1',
      segment: { type: 'COUNTRY', countries: ['TG'] },
      scheduledAt: '2026-11-03T18:00:00.000Z',
    })
    expect(campaignFormToInput({ ...form, deepLink: '', scheduledAt: null })).toMatchObject({
      deepLink: null,
      scheduledAt: null,
    })
  })

  it('round-trips a campaign through the form', () => {
    const source = campaign({
      deepLink: 'drama://series/ser_1',
      segment: { type: 'INACTIVE', inactiveDays: 21 },
      scheduledAt: '2026-11-03T18:00:00.000Z',
    })
    const form = campaignToForm(source)
    expect(form.segmentType).toBe('INACTIVE')
    expect(form.inactiveDays).toBe(21)
    expect(form.scheduledAt?.getHours()).toBe(18)
    expect(campaignFormToInput(form)).toMatchObject({
      deepLink: 'drama://series/ser_1',
      segment: { type: 'INACTIVE', inactiveDays: 21 },
      scheduledAt: '2026-11-03T18:00:00.000Z',
    })
  })

  it('describes segments with i18n keys and params', () => {
    expect(describeSegment({ type: 'ALL' })).toEqual({
      key: 'campaigns.segments.summary.ALL',
      params: {},
    })
    expect(describeSegment({ type: 'COUNTRY', countries: ['TG', 'CI'] }).params).toEqual({
      countries: 'TG, CI',
    })
    expect(describeSegment({ type: 'INACTIVE', inactiveDays: 7 }).params).toEqual({ days: 7 })
  })
})

describe('campaigns — lists and timeline', () => {
  it('counts per status with zeros and sorts newest first', () => {
    const list = [
      campaign({ id: 'a', createdAt: '2026-10-01T00:00:00.000Z' }),
      campaign({
        id: 'b',
        status: 'SENT',
        sentAt: '2026-10-20T00:00:00.000Z',
        createdAt: '2026-09-01T00:00:00.000Z',
      }),
      campaign({
        id: 'c',
        status: 'SCHEDULED',
        scheduledAt: '2026-11-01T00:00:00.000Z',
        createdAt: '2026-09-15T00:00:00.000Z',
      }),
    ]
    expect(countByStatus(list)).toEqual({
      DRAFT: 1,
      SCHEDULED: 1,
      SENDING: 0,
      SENT: 1,
      CANCELLED: 0,
    })
    expect(sortCampaigns(list).map((item) => item.id)).toEqual(['c', 'b', 'a'])
  })

  it('builds the timeline from the status and the available timestamps', () => {
    const draft = campaignTimeline(campaign())
    expect(draft.map((event) => [event.key, event.done])).toEqual([
      ['created', true],
      ['sending', false],
      ['sent', false],
    ])

    const sent = campaignTimeline(
      campaign({
        status: 'SENT',
        scheduledAt: '2026-10-20T09:00:00.000Z',
        sentAt: '2026-10-20T09:05:00.000Z',
      }),
    )
    expect(sent.map((event) => [event.key, event.done])).toEqual([
      ['created', true],
      ['scheduled', true],
      ['sending', true],
      ['sent', true],
    ])
    expect(sent[3]?.at).toBe('2026-10-20T09:05:00.000Z')

    const cancelled = campaignTimeline(
      campaign({
        status: 'CANCELLED',
        scheduledAt: '2026-10-25T17:00:00.000Z',
        cancelledAt: '2026-10-24T09:30:00.000Z',
      }),
    )
    expect(cancelled.map((event) => event.key)).toEqual(['created', 'scheduled', 'cancelled'])
  })

  it('computes the delivery rate with zero guards', () => {
    expect(deliveryRate({ audienceCount: 0, sentCount: 0 })).toBeNull()
    expect(deliveryRate({ audienceCount: 100, sentCount: 0 })).toBeNull()
    expect(deliveryRate({ audienceCount: 200, sentCount: 186 })).toBeCloseTo(0.93)
    expect(deliveryRate({ audienceCount: 10, sentCount: 20 })).toBe(1)
  })
})
