import type {
  RightsContract,
  RightsContractInput,
  RightsContractListItem,
  RightsContractListQuery,
  RightsContractUpdateInput,
} from '../types/api'
import { useApi } from './useApi'

/**
 * Typed wrapper over the rights-and-contracts routes (B-12, contract v1.6): one current contract
 * per series (`404 RIGHTS_CONTRACT_NOT_FOUND` when none, `409 RIGHTS_CONTRACT_ALREADY_EXISTS` on a
 * second `create`), and the renewal reminder list.
 */
export function useRightsApi() {
  const api = useApi()

  return {
    isMock: api.isMock,
    getContract: (seriesId: string, signal?: AbortSignal) =>
      api.get<RightsContract>(`/admin/series/${seriesId}/rights-contract`, { signal }),
    createContract: (seriesId: string, input: RightsContractInput) =>
      api.post<RightsContract>(`/admin/series/${seriesId}/rights-contract`, input),
    updateContract: (seriesId: string, input: RightsContractUpdateInput) =>
      api.patch<RightsContract>(`/admin/series/${seriesId}/rights-contract`, input),
    deleteContract: (seriesId: string) =>
      api.delete<null>(`/admin/series/${seriesId}/rights-contract`),
    listContracts: (query: RightsContractListQuery = {}, signal?: AbortSignal) =>
      api.get<{ items: RightsContractListItem[]; total: number }>('/admin/rights-contracts', {
        query: { expiringWithinDays: query.expiringWithinDays },
        signal,
      }),
  }
}

export type RightsApi = ReturnType<typeof useRightsApi>
