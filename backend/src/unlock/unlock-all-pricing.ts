/** Prix du déblocage d'une série entière (M-23, S10-BE-02) : somme des épisodes verrouillés, remise arrondie au supérieur. */
export interface UnlockAllQuote {
  lockedCount: number;
  fullPrice: number;
  discountPercent: number;
  price: number;
}

export function quoteUnlockAll(
  lockedCount: number,
  coinCostPerEpisode: number,
  discountPercent: number,
): UnlockAllQuote {
  const discount = Math.min(100, Math.max(0, discountPercent));
  const fullPrice = lockedCount * coinCostPerEpisode;
  const price = Math.ceil((fullPrice * (100 - discount)) / 100);
  return { lockedCount, fullPrice, discountPercent: discount, price };
}
