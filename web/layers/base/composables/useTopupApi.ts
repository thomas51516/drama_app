import type {
  AppUser,
  Paginated,
  PublicOffers,
  PublicShop,
  TopupOrder,
  TopupOrderCreated,
  TopupOrderCreateInput,
  TopupReconciliation,
  Wallet,
} from '../types/api'
import { useApi } from './useApi'

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
 * Mobile money top-ups (contract v1.5): the public routes of the recharge site (`/shop`,
 * `/offers`, `/wallet`, `/me`, `/topup/orders`) and the back-office reconciliation (B-11).
 */
export function useTopupApi() {
  const api = useApi()
  const encode = encodeURIComponent

  return {
    isMock: api.isMock,

    // --- public (recharge site) -------------------------------------------------------
    shop: (country: string, signal?: AbortSignal) =>
      api.get<PublicShop>('/shop', { headers: { 'X-Country': country }, signal }),
    offers: (signal?: AbortSignal) => api.get<PublicOffers>('/offers', { signal }),
    wallet: (signal?: AbortSignal) => api.get<Wallet>('/wallet', { signal }),
    me: (signal?: AbortSignal) => api.get<AppUser>('/me', { signal }),
    createOrder: (input: TopupOrderCreateInput) =>
      api.post<TopupOrderCreated>('/topup/orders', input),
    getOrder: (orderId: string, signal?: AbortSignal) =>
      api.get<TopupOrder>(`/topup/orders/${encode(orderId)}`, { signal }),
    listOrders: async (page = 1, signal?: AbortSignal) =>
      asPage(
        await api.get<TopupOrder[] | Paginated<TopupOrder>>('/topup/orders', {
          query: { page },
          signal,
        }),
      ),
    /** Mock-only: the fake payment page settles an order (`paid` or `failed`). */
    mockPay: (orderId: string, outcome: 'paid' | 'failed') =>
      api.post<TopupOrder>(`/topup/orders/${encode(orderId)}/mock-pay`, { outcome }),

    // --- back-office (B-11) -----------------------------------------------------------
    reconciliation: (date: string, signal?: AbortSignal) =>
      api.get<TopupReconciliation>('/admin/topup/reconciliation', { query: { date }, signal }),
  }
}

export type TopupApi = ReturnType<typeof useTopupApi>
