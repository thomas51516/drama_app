import type {
  AdminAccount,
  AdminAccountCreateInput,
  AdminAccountUpdateInput,
  AuditLog,
  AuditLogQuery,
  Paginated,
} from '../types/api'
import { useApi } from './useApi'

/** Typed wrappers over the accounts and audit endpoints of the addendum v1.1 (B-13, ADMIN only). */
export function useAdministrationApi() {
  const api = useApi()
  const encode = encodeURIComponent

  return {
    isMock: api.isMock,

    // --- accounts ---------------------------------------------------------
    listAccounts: (signal?: AbortSignal) => api.get<AdminAccount[]>('/admin/accounts', { signal }),
    createAccount: (input: AdminAccountCreateInput) =>
      api.post<AdminAccount>('/admin/accounts', input),
    updateAccount: (id: string, input: AdminAccountUpdateInput) =>
      api.patch<AdminAccount>(`/admin/accounts/${encode(id)}`, input),
    resetTotp: (id: string) => api.post<AdminAccount>(`/admin/accounts/${encode(id)}/reset-totp`),
    resetPassword: (id: string, password: string) =>
      api.post<null>(`/admin/accounts/${encode(id)}/reset-password`, { password }),

    // --- audit log --------------------------------------------------------
    listAuditLogs: (query: AuditLogQuery = {}, signal?: AbortSignal) =>
      api.get<Paginated<AuditLog>>('/admin/audit-logs', {
        query: {
          page: query.page,
          pageSize: query.pageSize,
          actorId: query.actorId || undefined,
          action: query.action?.trim() || undefined,
          targetType: query.targetType || undefined,
          targetId: query.targetId?.trim() || undefined,
          from: query.from || undefined,
          to: query.to || undefined,
        },
        signal,
      }),
  }
}

export type AdministrationApi = ReturnType<typeof useAdministrationApi>
