import type { TrustedDevice } from '../types/api'
import { useApi } from './useApi'

/** Typed wrappers over the trusted-device endpoints of contract v1.3 (B-13+, « Mon compte »). */
export function useAccountApi() {
  const api = useApi()
  const encode = encodeURIComponent

  return {
    isMock: api.isMock,
    listDevices: (signal?: AbortSignal) =>
      api.get<TrustedDevice[]>('/admin/auth/devices', { signal }),
    revokeDevice: (id: string) => api.delete<null>(`/admin/auth/devices/${encode(id)}`),
    /** ADMIN: revoke every trusted device of an account. */
    revokeAccountDevices: (accountId: string) =>
      api.post<null>(`/admin/accounts/${encode(accountId)}/revoke-devices`),
  }
}

export type AccountApi = ReturnType<typeof useAccountApi>
