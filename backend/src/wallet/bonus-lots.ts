/** Lot de pièces bonus : lignes BONUS du grand livre partageant la même date d'expiration. */
export interface BonusLot {
  expiresAt: Date | null;
  remaining: number;
}

export interface LotDebit {
  expiresAt: Date | null;
  amount: number;
}

/** Tri : les lots qui expirent le plus tôt d'abord, les lots sans expiration en dernier. */
export function sortLots<T extends { expiresAt: Date | null }>(lots: T[]): T[] {
  return [...lots].sort((a, b) => {
    if (a.expiresAt === null) return b.expiresAt === null ? 0 : 1;
    if (b.expiresAt === null) return -1;
    return a.expiresAt.getTime() - b.expiresAt.getTime();
  });
}

/** Lots encore valables (non expirés, solde positif), triés. */
export function spendableLots(lots: BonusLot[], now: Date): BonusLot[] {
  return sortLots(
    lots.filter((l) => l.remaining > 0 && (l.expiresAt === null || l.expiresAt > now)),
  );
}

/**
 * Répartition d'un débit sur les lots bonus (bonus avant achetées, lots les plus proches de
 * l'expiration d'abord — cahier des charges §3). Renvoie les débits par lot et le reste à prendre
 * sur les pièces achetées.
 */
export function planBonusConsumption(
  lots: BonusLot[],
  amount: number,
  now: Date,
): { debits: LotDebit[]; remainder: number } {
  const debits: LotDebit[] = [];
  let left = amount;
  for (const lot of spendableLots(lots, now)) {
    if (left <= 0) break;
    const take = Math.min(lot.remaining, left);
    debits.push({ expiresAt: lot.expiresAt, amount: take });
    left -= take;
  }
  return { debits, remainder: left };
}
