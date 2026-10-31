/**
 * Statut de droits d'une série (B-12), calculé à la lecture — jamais stocké.
 * NONE    : aucun contrat enregistré.
 * ACTIVE  : contrat enregistré et `licenseStartsAt <= now <= licenseEndsAt` (ou pas de date de fin).
 * EXPIRED : contrat enregistré mais hors fenêtre (licence terminée, ou — cas plus rare — pas encore
 *           commencée : le cahier des charges ne prévoit pas de quatrième état pour une licence
 *           future, donc elle est rapportée EXPIRED avec le détail dans `licenseStartsAt`/`notes`).
 */
export type RightsStatus = 'NONE' | 'ACTIVE' | 'EXPIRED';

export interface RightsContractWindow {
  licenseStartsAt: Date;
  licenseEndsAt: Date | null;
}

export function computeRightsStatus(
  contract: RightsContractWindow | null | undefined,
  now: Date = new Date(),
): RightsStatus {
  if (!contract) return 'NONE';
  const started = contract.licenseStartsAt <= now;
  const notEnded = contract.licenseEndsAt === null || contract.licenseEndsAt >= now;
  return started && notEnded ? 'ACTIVE' : 'EXPIRED';
}
