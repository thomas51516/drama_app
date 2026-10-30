import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useAuthStore } from '../stores/auth'
import { useSupportInboxStore } from '../stores/support-inbox'
import { useCampaignsApi } from '../composables/useCampaignsApi'
import { useHelpCenterApi } from '../composables/useHelpCenterApi'
import { mockCredentials, mockTiming, resetMockState } from '../mocks'

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

async function signIn(email = mockCredentials.email): Promise<void> {
  const auth = useAuthStore()
  auth.clearSession()
  await auth.login(email, mockCredentials.password)
  await auth.verifyTotp(mockCredentials.totpCode)
}

describe('mock API — campaigns, FAQ and support (contract v1.3)', () => {
  const timing = { ...mockTiming }

  beforeEach(() => {
    Object.assign(mockTiming, { latencyMs: 0, campaignSendMs: 30 })
    resetMockState()
  })

  afterEach(() => {
    Object.assign(mockTiming, timing)
    resetMockState()
    useAuthStore().clearSession()
    useSupportInboxStore().reset()
  })

  it('refuses campaigns to EDITOR (403) and serves them to ADMIN', async () => {
    await signIn('editor@drama.local')
    await expect(useCampaignsApi().listCampaigns()).rejects.toMatchObject({ status: 403 })

    await signIn()
    const list = await useCampaignsApi().listCampaigns()
    expect(list.length).toBeGreaterThanOrEqual(4)
    expect(list[0]).toMatchObject({
      id: expect.any(String),
      segment: { type: expect.any(String) },
      status: expect.any(String),
      audienceCount: expect.any(Number),
      sentCount: expect.any(Number),
      createdBy: expect.any(String),
    })
  })

  it('creates, estimates, sends and completes a campaign; refuses invalid payloads', async () => {
    await signIn()
    const api = useCampaignsApi()

    await expect(
      api.createCampaign({ title: 'x', body: 'y'.repeat(179), segment: { type: 'ALL' } }),
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      api.createCampaign({ title: 'x', body: 'y', segment: { type: 'COUNTRY', countries: [] } }),
    ).rejects.toMatchObject({ status: 400 })

    const created = await api.createCampaign({
      title: 'Test',
      body: 'Bonjour',
      deepLink: 'drama://series/ser_01HZX0A1B2C3D4E5F6G7H8J9K1',
      segment: { type: 'COUNTRY', countries: ['TG', 'CI'] },
    })
    expect(created.status).toBe('DRAFT')
    expect(created.createdBy).toBe(mockCredentials.email)

    const { audienceCount } = await api.estimateCampaign(created.id)
    expect(audienceCount).toBe(4120 + 2890)

    const sending = await api.sendCampaign(created.id)
    expect(sending.status).toBe('SENDING')
    await expect(api.sendCampaign(created.id)).rejects.toMatchObject({ status: 409 })
    await expect(api.deleteCampaign(created.id)).rejects.toMatchObject({ status: 409 })

    await sleep(60)
    const sent = await api.getCampaign(created.id)
    expect(sent.status).toBe('SENT')
    expect(sent.sentCount).toBeGreaterThan(0)
    expect(sent.sentCount).toBeLessThanOrEqual(sent.audienceCount)
    expect(sent.sentAt).toEqual(expect.any(String))
  })

  it('schedules a future campaign, cancels it, and deletes drafts only', async () => {
    await signIn('money@drama.local')
    const api = useCampaignsApi()
    const future = new Date(Date.now() + 3 * 86_400_000).toISOString()
    const draft = await api.createCampaign({
      title: 'Plus tard',
      body: 'Corps',
      segment: { type: 'INACTIVE', inactiveDays: 14 },
      scheduledAt: future,
    })
    const scheduled = await api.sendCampaign(draft.id)
    expect(scheduled.status).toBe('SCHEDULED')
    expect(scheduled.audienceCount).toBeGreaterThan(0)

    const edited = await api.updateCampaign(draft.id, { title: 'Plus tard (v2)' })
    expect(edited.title).toBe('Plus tard (v2)')

    const cancelled = await api.cancelCampaign(draft.id)
    expect(cancelled.status).toBe('CANCELLED')
    expect(cancelled.cancelledAt).toEqual(expect.any(String))
    await expect(api.cancelCampaign(draft.id)).rejects.toMatchObject({ status: 409 })
    await expect(api.updateCampaign(draft.id, { title: 'x' })).rejects.toMatchObject({
      status: 409,
    })

    const other = await api.createCampaign({
      title: 'Brouillon',
      body: 'b',
      segment: { type: 'ALL' },
    })
    await api.deleteCampaign(other.id)
    await expect(api.getCampaign(other.id)).rejects.toMatchObject({ status: 404 })
  })

  it('manages the FAQ and exposes it on the public GET /help/faq with the French fallback', async () => {
    await signIn('editor@drama.local')
    const api = useHelpCenterApi()
    const before = await api.listFaq()
    expect(before.length).toBeGreaterThan(0)

    await expect(
      api.createFaq({ category: 'coins', question: { fr: '' }, answer: { fr: 'x' } }),
    ).rejects.toMatchObject({ status: 400 })

    const created = await api.createFaq({
      category: 'content',
      question: { fr: 'Puis-je télécharger ?', en: 'Can I download?' },
      answer: { fr: 'Oui, en Wi-Fi.', en: 'Yes, over Wi-Fi.' },
      isPublished: false,
    })
    expect(created.position).toBe(before.length + 1)

    let pub = await api.publicFaq('fr')
    expect(pub.categories.some((category) => category.key === 'content')).toBe(false)

    await api.updateFaq(created.id, { isPublished: true })
    pub = await api.publicFaq('en')
    const downloads = pub.categories.find((category) => category.key === 'content')
    expect(downloads?.title).toBe('Content')
    expect(downloads?.entries).toEqual([
      { id: created.id, question: 'Can I download?', answer: 'Yes, over Wi-Fi.' },
    ])
    const pt = await api.publicFaq('pt')
    expect(pt.categories.find((category) => category.key === 'content')?.entries[0]).toEqual({
      id: created.id,
      question: 'Puis-je télécharger ?',
      answer: 'Oui, en Wi-Fi.',
    })

    // Reorder: move the new entry first.
    const ids = (await api.listFaq()).map((entry) => entry.id)
    const reordered = await api.reorderFaq([created.id, ...ids.filter((id) => id !== created.id)])
    expect(reordered[0]?.id).toBe(created.id)
    expect(reordered[0]?.position).toBe(1)
    await expect(api.reorderFaq([created.id])).rejects.toMatchObject({ status: 400 })

    await api.deleteFaq(created.id)
    expect((await api.listFaq()).some((entry) => entry.id === created.id)).toBe(false)

    // The FAQ is refused to MONETIZATION.
    await signIn('money@drama.local')
    await expect(useHelpCenterApi().listFaq()).rejects.toMatchObject({ status: 403 })
  })

  it('serves the support inbox to SUPPORT, replies, closes and refuses replies on closed tickets', async () => {
    await signIn('editor@drama.local')
    await expect(useHelpCenterApi().listTickets()).rejects.toMatchObject({ status: 403 })

    await signIn('support@drama.local')
    const api = useHelpCenterApi()
    const inbox = useSupportInboxStore()
    expect(await inbox.refresh()).toBe(2)

    const open = await api.listTickets({ status: 'OPEN' })
    expect(open.total).toBe(2)
    expect(open.items.every((ticket) => ticket.status === 'OPEN')).toBe(true)
    const ticket = open.items[0]!

    await expect(api.replyTicket(ticket.id, '  ')).rejects.toMatchObject({ status: 400 })
    const answered = await api.replyTicket(ticket.id, 'Bonjour, nous vérifions.')
    expect(answered.status).toBe('ANSWERED')
    expect(answered.messages.at(-1)).toMatchObject({
      from: 'support',
      body: 'Bonjour, nous vérifions.',
    })
    expect(await inbox.refresh()).toBe(1)

    const closed = await api.closeTicket(ticket.id)
    expect(closed.status).toBe('CLOSED')
    await expect(api.replyTicket(ticket.id, 'Encore ?')).rejects.toMatchObject({ status: 409 })
    await expect(api.closeTicket(ticket.id)).rejects.toMatchObject({ status: 409 })

    const all = await api.listTickets({ pageSize: 2 })
    expect(all.total).toBe(4)
    expect(all.items).toHaveLength(2)
    expect(all.pageSize).toBe(2)
  })

  it('keeps the badge null for roles without the inbox', async () => {
    await signIn('editor@drama.local')
    const inbox = useSupportInboxStore()
    expect(await inbox.refresh()).toBeNull()
    expect(inbox.openCount).toBeNull()
  })
})
