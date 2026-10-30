import type {
  FaqEntry,
  FaqEntryInput,
  Paginated,
  PublicFaqResponse,
  SupportTicket,
  SupportTicketQuery,
} from '../types/api'
import { useApi } from './useApi'

/**
 * Typed wrappers over the help center endpoints of contract v1.3 (M-53 / B-03bis):
 * FAQ (EDITOR, SUPPORT, ADMIN), support tickets (SUPPORT, ADMIN) and the public FAQ used by
 * the preview.
 */
export function useHelpCenterApi() {
  const api = useApi()
  const encode = encodeURIComponent

  return {
    isMock: api.isMock,

    // --- FAQ ----------------------------------------------------------------
    listFaq: (signal?: AbortSignal) => api.get<FaqEntry[]>('/admin/faq', { signal }),
    createFaq: (input: FaqEntryInput) => api.post<FaqEntry>('/admin/faq', input),
    updateFaq: (id: string, input: FaqEntryInput) =>
      api.patch<FaqEntry>(`/admin/faq/${encode(id)}`, input),
    deleteFaq: (id: string) => api.delete<null>(`/admin/faq/${encode(id)}`),
    reorderFaq: (ids: string[]) => api.put<FaqEntry[]>('/admin/faq/order', { ids }),
    /** Public endpoint, what the app receives (published entries, language with French fallback). */
    publicFaq: (lang: string, signal?: AbortSignal) =>
      api.get<PublicFaqResponse>('/help/faq', { query: { lang }, signal }),

    // --- support tickets ----------------------------------------------------
    listTickets: (query: SupportTicketQuery = {}, signal?: AbortSignal) =>
      api.get<Paginated<SupportTicket>>('/admin/support/tickets', {
        query: { status: query.status, page: query.page, pageSize: query.pageSize },
        signal,
      }),
    getTicket: (id: string, signal?: AbortSignal) =>
      api.get<SupportTicket>(`/admin/support/tickets/${encode(id)}`, { signal }),
    replyTicket: (id: string, message: string) =>
      api.post<SupportTicket>(`/admin/support/tickets/${encode(id)}/reply`, { message }),
    closeTicket: (id: string) =>
      api.post<SupportTicket>(`/admin/support/tickets/${encode(id)}/close`),
  }
}

export type HelpCenterApi = ReturnType<typeof useHelpCenterApi>
