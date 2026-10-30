import type {
  LimitedOffer,
  LimitedOfferInput,
  Paginated,
  PromoCode,
  PromoCodeInput,
  PromoRedemption,
  WelcomeOffer,
} from '../types/api'
import { useApi } from './useApi'

function asList<T>(raw: T[] | { items: T[] } | null | undefined): T[] {
  return Array.isArray(raw) ? raw : (raw?.items ?? [])
}

/** The backend may answer a bare array, or an object without `page`/`pageSize` (redemptions). */
function asPage<T>(
  raw:
    | T[]
    | (Partial<Pick<Paginated<T>, 'page' | 'pageSize'>> & Pick<Paginated<T>, 'items' | 'total'>)
    | null
    | undefined,
): Paginated<T> {
  if (Array.isArray(raw)) return { items: raw, total: raw.length, page: 1, pageSize: raw.length }
  if (!raw) return { items: [], total: 0, page: 1, pageSize: 20 }
  return { items: raw.items, total: raw.total, page: raw.page ?? 1, pageSize: raw.pageSize ?? 20 }
}

/**
 * Typed wrappers over the offers endpoints of contract v1.5 (B-07, MONETIZATION and ADMIN):
 * welcome offer, limited offers and promo codes with their redemptions.
 */
export function useOffersApi() {
  const api = useApi()
  const encode = encodeURIComponent

  return {
    isMock: api.isMock,

    getWelcome: (signal?: AbortSignal) =>
      api.get<WelcomeOffer | null>('/admin/offers/welcome', { signal }),
    updateWelcome: (input: WelcomeOffer) => api.put<WelcomeOffer>('/admin/offers/welcome', input),

    listLimited: async (signal?: AbortSignal) =>
      asList(
        await api.get<LimitedOffer[] | { items: LimitedOffer[] }>('/admin/offers/limited', {
          signal,
        }),
      ),
    createLimited: (input: LimitedOfferInput) =>
      api.post<LimitedOffer>('/admin/offers/limited', input),
    updateLimited: (id: string, input: LimitedOfferInput) =>
      api.patch<LimitedOffer>(`/admin/offers/limited/${encode(id)}`, input),
    deleteLimited: (id: string) => api.delete<null>(`/admin/offers/limited/${encode(id)}`),

    listPromoCodes: async (signal?: AbortSignal) =>
      asList(await api.get<PromoCode[] | { items: PromoCode[] }>('/admin/promo-codes', { signal })),
    createPromoCode: (input: PromoCodeInput) => api.post<PromoCode>('/admin/promo-codes', input),
    updatePromoCode: (id: string, input: PromoCodeInput) =>
      api.patch<PromoCode>(`/admin/promo-codes/${encode(id)}`, input),
    listRedemptions: async (id: string, page = 1, signal?: AbortSignal) =>
      asPage(
        await api.get<PromoRedemption[] | Paginated<PromoRedemption>>(
          `/admin/promo-codes/${encode(id)}/redemptions`,
          { query: { page, pageSize: 20 }, signal },
        ),
      ),
  }
}

export type OffersApi = ReturnType<typeof useOffersApi>
