import type {
  AdminRole,
  FaqEntry,
  FaqEntryInput,
  FaqLanguage,
  FaqLocalized,
  PublicFaqResponse,
  SupportTicket,
  SupportTicketStatus,
} from '../types/api'
import { FAQ_LANGUAGES } from '../types/api'

/**
 * Pure helpers of the help center module (M-53 / B-03bis, contract v1.3): FAQ categories,
 * multilingual form with French fallback, the preview computed like the public `GET /help/faq`,
 * ordering, and the support ticket state machine.
 */

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

/** FAQ management: EDITOR, SUPPORT and ADMIN (contract v1.3). */
export function canManageFaq(role: AdminRole | null | undefined): boolean {
  return role === 'EDITOR' || role === 'SUPPORT' || role === 'ADMIN'
}

/** Support inbox: SUPPORT and ADMIN. */
export function canUseSupportInbox(role: AdminRole | null | undefined): boolean {
  return role === 'SUPPORT' || role === 'ADMIN'
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

/**
 * Fixed category keys of the FAQ, in display order, with the titles the backend returns in
 * `GET /help/faq` (`HELP_CATEGORIES` / `CATEGORY_TITLES` of backend/src/help). Keep both in sync.
 */
export const FAQ_CATEGORIES = [
  'account',
  'coins',
  'vip',
  'playback',
  'payment',
  'content',
  'other',
] as const
export type FaqCategory = (typeof FAQ_CATEGORIES)[number]

export const FAQ_CATEGORY_TITLES: Record<FaqCategory, Record<FaqLanguage, string>> = {
  account: { fr: 'Compte', en: 'Account', es: 'Cuenta', pt: 'Conta' },
  coins: { fr: 'Pièces', en: 'Coins', es: 'Monedas', pt: 'Moedas' },
  vip: { fr: 'VIP', en: 'VIP', es: 'VIP', pt: 'VIP' },
  playback: { fr: 'Lecture', en: 'Playback', es: 'Reproducción', pt: 'Reprodução' },
  payment: { fr: 'Paiement', en: 'Payment', es: 'Pago', pt: 'Pagamento' },
  content: { fr: 'Contenu', en: 'Content', es: 'Contenido', pt: 'Conteúdo' },
  other: { fr: 'Autre', en: 'Other', es: 'Otro', pt: 'Outro' },
}

export function isFaqCategory(value: unknown): value is FaqCategory {
  return typeof value === 'string' && (FAQ_CATEGORIES as readonly string[]).includes(value)
}

/** Title of a category in `lang`, French fallback, the raw key for unknown categories. */
export function faqCategoryTitle(category: string, lang: string): string {
  if (!isFaqCategory(category)) return category
  const titles = FAQ_CATEGORY_TITLES[category]
  return titles[lang as FaqLanguage] ?? titles.fr
}

// ---------------------------------------------------------------------------
// Localized text and preview
// ---------------------------------------------------------------------------

export function isFaqLanguage(value: unknown): value is FaqLanguage {
  return typeof value === 'string' && (FAQ_LANGUAGES as readonly string[]).includes(value)
}

/** Text in the requested language, falling back to French (contract: "repli fr"). */
export function localizedText(
  text: Partial<FaqLocalized> | null | undefined,
  lang: string,
): string {
  if (!text) return ''
  const value = text[lang as keyof FaqLocalized]
  return (value && value.trim()) || text.fr?.trim() || ''
}

/** Languages for which an entry has both a question and an answer. */
export function translatedLanguages(entry: Pick<FaqEntry, 'question' | 'answer'>): FaqLanguage[] {
  return FAQ_LANGUAGES.filter((lang) => {
    const question = entry.question[lang]
    const answer = entry.answer[lang]
    return Boolean(question && question.trim() && answer && answer.trim())
  })
}

export function sortFaqEntries(entries: readonly FaqEntry[]): FaqEntry[] {
  return [...entries].sort((a, b) => a.position - b.position)
}

/** Entries grouped by category (category order = `FAQ_CATEGORIES`, unknown keys last). */
export function groupFaqByCategory(
  entries: readonly FaqEntry[],
): { key: string; entries: FaqEntry[] }[] {
  const sorted = sortFaqEntries(entries)
  const keys = [
    ...FAQ_CATEGORIES.filter((key) => sorted.some((entry) => entry.category === key)),
    ...Array.from(new Set(sorted.map((entry) => entry.category))).filter(
      (key) => !isFaqCategory(key),
    ),
  ]
  return keys.map((key) => ({ key, entries: sorted.filter((entry) => entry.category === key) }))
}

/** Global id order after a drag-and-drop inside one category (other categories unchanged). */
export function reorderWithinCategory(
  entries: readonly FaqEntry[],
  category: string,
  orderedIds: readonly string[],
): string[] {
  const groups = groupFaqByCategory(entries)
  return groups.flatMap((group) =>
    group.key === category ? [...orderedIds] : group.entries.map((entry) => entry.id),
  )
}

/** Reassign `position` 1..n following `ids` (optimistic update before the PUT). */
export function applyFaqOrder(entries: readonly FaqEntry[], ids: readonly string[]): FaqEntry[] {
  const byId = new Map(entries.map((entry) => [entry.id, entry]))
  const ordered = ids.map((id) => byId.get(id)).filter((entry): entry is FaqEntry => Boolean(entry))
  const rest = entries.filter((entry) => !ids.includes(entry.id))
  return [...ordered, ...rest].map((entry, index) => ({ ...entry, position: index + 1 }))
}

/**
 * What the app shows for `GET /help/faq?lang`: published entries only, requested language with
 * French fallback, categories in the fixed order, empty categories dropped.
 */
export function faqPreview(entries: readonly FaqEntry[], lang: string): PublicFaqResponse {
  const categories = groupFaqByCategory(entries.filter((entry) => entry.isPublished))
    .map((group) => ({
      key: group.key,
      title: faqCategoryTitle(group.key, lang),
      entries: group.entries
        .map((entry) => ({
          id: entry.id,
          question: localizedText(entry.question, lang),
          answer: localizedText(entry.answer, lang),
        }))
        .filter((entry) => entry.question && entry.answer),
    }))
    .filter((group) => group.entries.length > 0)
  return { categories }
}

// ---------------------------------------------------------------------------
// FAQ form
// ---------------------------------------------------------------------------

export const FAQ_QUESTION_MAX = 160
export const FAQ_ANSWER_MAX = 2000

export type FaqFormTexts = Record<FaqLanguage, string>

export interface FaqFormValues {
  category: string
  question: FaqFormTexts
  answer: FaqFormTexts
  isPublished: boolean
}

export type FaqFormErrors = Partial<Record<'category' | 'question' | 'answer', string>>

export function emptyFaqTexts(): FaqFormTexts {
  return { fr: '', en: '', es: '', pt: '' }
}

export function emptyFaqForm(category: string = FAQ_CATEGORIES[0]): FaqFormValues {
  return { category, question: emptyFaqTexts(), answer: emptyFaqTexts(), isPublished: false }
}

export function faqEntryToForm(entry: FaqEntry): FaqFormValues {
  const question = emptyFaqTexts()
  const answer = emptyFaqTexts()
  for (const lang of FAQ_LANGUAGES) {
    question[lang] = entry.question[lang] ?? ''
    answer[lang] = entry.answer[lang] ?? ''
  }
  return { category: entry.category, question, answer, isPublished: entry.isPublished }
}

export function validateFaqForm(values: FaqFormValues): FaqFormErrors {
  const errors: FaqFormErrors = {}
  if (!values.category.trim()) errors.category = 'validation.required'
  if (!values.question.fr.trim()) errors.question = 'validation.requiredFrench'
  else if (FAQ_LANGUAGES.some((lang) => values.question[lang].trim().length > FAQ_QUESTION_MAX)) {
    errors.question = 'validation.maxLength'
  }
  if (!values.answer.fr.trim()) errors.answer = 'validation.requiredFrench'
  else if (FAQ_LANGUAGES.some((lang) => values.answer[lang].trim().length > FAQ_ANSWER_MAX)) {
    errors.answer = 'validation.maxLength'
  }
  // A translation needs both sides: a question without its answer would fall back to French
  // for the answer only, which reads badly in the app.
  for (const lang of FAQ_LANGUAGES) {
    if (lang === 'fr') continue
    const q = values.question[lang].trim()
    const a = values.answer[lang].trim()
    if ((q && !a) || (!q && a)) {
      errors.answer = errors.answer ?? 'validation.translationPair'
    }
  }
  return errors
}

/** Empty translations are sent as `null` so the API applies the French fallback. */
export function faqFormToInput(values: FaqFormValues): FaqEntryInput {
  const toLocalized = (texts: FaqFormTexts): FaqLocalized => ({
    fr: texts.fr.trim(),
    en: texts.en.trim() || null,
    es: texts.es.trim() || null,
    pt: texts.pt.trim() || null,
  })
  return {
    category: values.category.trim(),
    question: toLocalized(values.question),
    answer: toLocalized(values.answer),
    isPublished: values.isPublished,
  }
}

// ---------------------------------------------------------------------------
// Support tickets
// ---------------------------------------------------------------------------

export type TicketAction = 'reply' | 'close' | 'userMessage'

/**
 * State machine of a ticket (contract v1.3): a support reply answers an open ticket, a new user
 * message reopens an answered one, closing is final (no reply on a closed ticket).
 */
export function ticketTransition(
  status: SupportTicketStatus,
  action: TicketAction,
): SupportTicketStatus | null {
  switch (action) {
    case 'reply':
      return status === 'CLOSED' ? null : 'ANSWERED'
    case 'close':
      return status === 'CLOSED' ? null : 'CLOSED'
    case 'userMessage':
      return status === 'CLOSED' ? null : 'OPEN'
  }
}

export function canReplyTicket(status: SupportTicketStatus): boolean {
  return ticketTransition(status, 'reply') !== null
}

export function canCloseTicket(status: SupportTicketStatus): boolean {
  return ticketTransition(status, 'close') !== null
}

export function ticketStatusSeverity(status: SupportTicketStatus): 'warn' | 'info' | 'secondary' {
  switch (status) {
    case 'OPEN':
      return 'warn'
    case 'ANSWERED':
      return 'info'
    case 'CLOSED':
      return 'secondary'
  }
}

export function isTicketStatus(value: unknown): value is SupportTicketStatus {
  return value === 'OPEN' || value === 'ANSWERED' || value === 'CLOSED'
}

/** Open tickets are the "unread" ones of the sidebar badge. */
export function openTicketCount(tickets: readonly Pick<SupportTicket, 'status'>[]): number {
  return tickets.filter((ticket) => ticket.status === 'OPEN').length
}

/** Most recently updated first. */
export function sortTickets(tickets: readonly SupportTicket[]): SupportTicket[] {
  return [...tickets].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  )
}

export const TICKET_REPLY_MAX = 2000

export function validateTicketReply(message: string): string | null {
  const text = message.trim()
  if (!text) return 'validation.required'
  if (text.length > TICKET_REPLY_MAX) return 'validation.maxLength'
  return null
}

/** Last message of the conversation (for the inbox list excerpt). */
export function lastMessage(ticket: SupportTicket): SupportTicket['messages'][number] | null {
  return ticket.messages.length > 0 ? (ticket.messages[ticket.messages.length - 1] ?? null) : null
}
