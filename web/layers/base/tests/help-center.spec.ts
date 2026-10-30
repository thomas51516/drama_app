import { describe, expect, it } from 'vitest'
import type { FaqEntry, SupportTicket } from '../types/api'
import {
  applyFaqOrder,
  canCloseTicket,
  canManageFaq,
  canReplyTicket,
  canUseSupportInbox,
  emptyFaqForm,
  faqCategoryTitle,
  faqEntryToForm,
  faqFormToInput,
  faqPreview,
  groupFaqByCategory,
  localizedText,
  openTicketCount,
  reorderWithinCategory,
  sortTickets,
  ticketTransition,
  translatedLanguages,
  validateFaqForm,
  validateTicketReply,
} from '../utils/help-center'

function entry(overrides: Partial<FaqEntry> = {}): FaqEntry {
  return {
    id: 'faq_1',
    category: 'account',
    question: { fr: 'Question FR', en: 'Question EN' },
    answer: { fr: 'Réponse FR', en: 'Answer EN' },
    position: 1,
    isPublished: true,
    ...overrides,
  }
}

describe('help center — roles', () => {
  it('opens the FAQ to EDITOR, SUPPORT and ADMIN, the inbox to SUPPORT and ADMIN', () => {
    expect(canManageFaq('EDITOR')).toBe(true)
    expect(canManageFaq('SUPPORT')).toBe(true)
    expect(canManageFaq('ADMIN')).toBe(true)
    expect(canManageFaq('MONETIZATION')).toBe(false)
    expect(canUseSupportInbox('SUPPORT')).toBe(true)
    expect(canUseSupportInbox('ADMIN')).toBe(true)
    expect(canUseSupportInbox('EDITOR')).toBe(false)
    expect(canUseSupportInbox(undefined)).toBe(false)
  })
})

describe('help center — i18n fallback and preview', () => {
  it('returns the requested language and falls back to French', () => {
    expect(localizedText({ fr: 'Bonjour', en: 'Hello' }, 'en')).toBe('Hello')
    expect(localizedText({ fr: 'Bonjour', en: null }, 'en')).toBe('Bonjour')
    expect(localizedText({ fr: 'Bonjour', es: '   ' }, 'es')).toBe('Bonjour')
    expect(localizedText({ fr: 'Bonjour' }, 'pt')).toBe('Bonjour')
    expect(localizedText(null, 'fr')).toBe('')
    expect(faqCategoryTitle('coins', 'en')).toBe('Coins')
    expect(faqCategoryTitle('coins', 'de')).toBe('Pièces')
    expect(faqCategoryTitle('custom', 'fr')).toBe('custom')
  })

  it('lists the languages with both a question and an answer', () => {
    expect(translatedLanguages(entry())).toEqual(['fr', 'en'])
    expect(translatedLanguages(entry({ answer: { fr: 'R', en: null } }))).toEqual(['fr'])
  })

  it('previews like GET /help/faq: published only, fallback, fixed category order', () => {
    const entries = [
      entry({
        id: 'a',
        category: 'coins',
        position: 3,
        question: { fr: 'Q coins' },
        answer: { fr: 'R coins' },
      }),
      entry({ id: 'b', category: 'account', position: 1 }),
      entry({ id: 'c', category: 'account', position: 2, isPublished: false }),
      entry({
        id: 'd',
        category: 'vip',
        position: 4,
        question: { fr: 'Q vip', en: 'Q vip EN' },
        answer: { fr: 'R vip', en: null },
      }),
    ]
    const fr = faqPreview(entries, 'fr')
    expect(fr.categories.map((category) => category.key)).toEqual(['account', 'coins', 'vip'])
    expect(fr.categories[0]?.entries.map((item) => item.id)).toEqual(['b'])
    expect(fr.categories[0]?.title).toBe('Compte')

    const en = faqPreview(entries, 'en')
    expect(en.categories[0]?.title).toBe('Account')
    expect(en.categories[0]?.entries[0]).toEqual({
      id: 'b',
      question: 'Question EN',
      answer: 'Answer EN',
    })
    // No English translation → French text.
    expect(en.categories[1]?.entries[0]).toEqual({
      id: 'a',
      question: 'Q coins',
      answer: 'R coins',
    })
    // Question translated but not the answer → answer falls back to French.
    expect(en.categories[2]?.entries[0]).toEqual({ id: 'd', question: 'Q vip EN', answer: 'R vip' })

    expect(
      faqPreview(
        entries.map((item) => ({ ...item, isPublished: false })),
        'fr',
      ).categories,
    ).toEqual([])
  })
})

describe('help center — FAQ form and ordering', () => {
  it('requires French texts, limits lengths and asks for complete translations', () => {
    const form = emptyFaqForm('coins')
    expect(validateFaqForm(form)).toEqual({
      question: 'validation.requiredFrench',
      answer: 'validation.requiredFrench',
    })
    form.question.fr = 'Q'
    form.answer.fr = 'R'
    expect(validateFaqForm(form)).toEqual({})
    form.question.en = 'Only the question'
    expect(validateFaqForm(form)).toEqual({ answer: 'validation.translationPair' })
    form.answer.en = 'And the answer'
    expect(validateFaqForm(form)).toEqual({})
    form.question.es = 'x'.repeat(161)
    form.answer.es = 'y'
    expect(validateFaqForm(form).question).toBe('validation.maxLength')
  })

  it('sends empty translations as null and trims the texts', () => {
    const form = emptyFaqForm('vip')
    form.question.fr = ' Q '
    form.answer.fr = ' R '
    form.question.en = 'Q EN'
    form.answer.en = 'A EN'
    form.isPublished = true
    expect(faqFormToInput(form)).toEqual({
      category: 'vip',
      question: { fr: 'Q', en: 'Q EN', es: null, pt: null },
      answer: { fr: 'R', en: 'A EN', es: null, pt: null },
      isPublished: true,
    })
    expect(faqEntryToForm(entry({ question: { fr: 'Q', en: null } })).question).toEqual({
      fr: 'Q',
      en: '',
      es: '',
      pt: '',
    })
  })

  it('groups by category and reorders within one category only', () => {
    const entries = [
      entry({ id: 'a1', category: 'account', position: 1 }),
      entry({ id: 'a2', category: 'account', position: 2 }),
      entry({ id: 'c1', category: 'coins', position: 3 }),
      entry({ id: 'x1', category: 'custom', position: 4 }),
    ]
    expect(groupFaqByCategory(entries).map((group) => group.key)).toEqual([
      'account',
      'coins',
      'custom',
    ])
    const ids = reorderWithinCategory(entries, 'account', ['a2', 'a1'])
    expect(ids).toEqual(['a2', 'a1', 'c1', 'x1'])
    expect(applyFaqOrder(entries, ids).map((item) => [item.id, item.position])).toEqual([
      ['a2', 1],
      ['a1', 2],
      ['c1', 3],
      ['x1', 4],
    ])
  })
})

describe('help center — ticket state transitions', () => {
  it('follows the contract state machine', () => {
    expect(ticketTransition('OPEN', 'reply')).toBe('ANSWERED')
    expect(ticketTransition('ANSWERED', 'reply')).toBe('ANSWERED')
    expect(ticketTransition('CLOSED', 'reply')).toBeNull()
    expect(ticketTransition('OPEN', 'close')).toBe('CLOSED')
    expect(ticketTransition('ANSWERED', 'close')).toBe('CLOSED')
    expect(ticketTransition('CLOSED', 'close')).toBeNull()
    expect(ticketTransition('ANSWERED', 'userMessage')).toBe('OPEN')
    expect(ticketTransition('CLOSED', 'userMessage')).toBeNull()
    expect(canReplyTicket('OPEN')).toBe(true)
    expect(canReplyTicket('CLOSED')).toBe(false)
    expect(canCloseTicket('ANSWERED')).toBe(true)
    expect(canCloseTicket('CLOSED')).toBe(false)
  })

  it('validates replies, counts open tickets and sorts by update date', () => {
    expect(validateTicketReply('   ')).toBe('validation.required')
    expect(validateTicketReply('x'.repeat(2001))).toBe('validation.maxLength')
    expect(validateTicketReply('Bonjour')).toBeNull()

    const ticket = (
      id: string,
      status: SupportTicket['status'],
      updatedAt: string,
    ): SupportTicket => ({
      id,
      userId: 'u',
      userLabel: 'U',
      category: 'other',
      subject: 'S',
      status,
      messages: [],
      createdAt: updatedAt,
      updatedAt,
    })
    const list = [
      ticket('a', 'OPEN', '2026-10-01T00:00:00.000Z'),
      ticket('b', 'CLOSED', '2026-10-03T00:00:00.000Z'),
      ticket('c', 'OPEN', '2026-10-02T00:00:00.000Z'),
    ]
    expect(openTicketCount(list)).toBe(2)
    expect(sortTickets(list).map((item) => item.id)).toEqual(['b', 'c', 'a'])
  })
})
