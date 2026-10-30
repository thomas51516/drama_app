import type {
  AdminUserDetail,
  AdminUserSummary,
  AdminUsersQuery,
  AppUser,
  CoinAdjustmentInput,
  Paginated,
  UserBlockInput,
  Wallet,
} from '../types/api'
import { useApi } from './useApi'

/** Typed wrappers over the end-user endpoints of contract v1.4 (B-09, SUPPORT and ADMIN). */
export function useUsersApi() {
  const api = useApi()
  const encode = encodeURIComponent

  return {
    isMock: api.isMock,
    searchUsers: (query: AdminUsersQuery, signal?: AbortSignal) =>
      api.get<Paginated<AdminUserSummary>>('/admin/users', {
        query: {
          q: query.q?.trim() || undefined,
          page: query.page,
          pageSize: query.pageSize,
        },
        signal,
      }),
    getUser: (id: string, signal?: AbortSignal) =>
      api.get<AdminUserDetail>(`/admin/users/${encode(id)}`, { signal }),
    /** One ADJUSTMENT ledger line; the reason is mandatory and audited. Returns the new wallet. */
    adjustCoins: (id: string, input: CoinAdjustmentInput) =>
      api.post<Wallet>(`/admin/users/${encode(id)}/coins`, input),
    blockUser: (id: string, input: UserBlockInput) =>
      api.post<AppUser>(`/admin/users/${encode(id)}/block`, input),
    unblockUser: (id: string, input: UserBlockInput) =>
      api.post<AppUser>(`/admin/users/${encode(id)}/unblock`, input),
  }
}

export type UsersApi = ReturnType<typeof useUsersApi>
