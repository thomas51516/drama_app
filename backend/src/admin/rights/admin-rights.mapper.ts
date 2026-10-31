import { type RightsContract } from '../../generated/prisma/client.js';
import { type RightsContractDto } from './dto/admin-rights.dto.js';

export function toRightsContractDto(contract: RightsContract): RightsContractDto {
  return {
    id: contract.id,
    seriesId: contract.seriesId,
    rightsHolder: contract.rightsHolder,
    territories: contract.territories,
    licenseStartsAt: contract.licenseStartsAt.toISOString(),
    licenseEndsAt: contract.licenseEndsAt?.toISOString() ?? null,
    notes: contract.notes ?? null,
    createdAt: contract.createdAt.toISOString(),
    updatedAt: contract.updatedAt.toISOString(),
  };
}
