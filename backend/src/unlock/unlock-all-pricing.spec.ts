import { quoteUnlockAll } from './unlock-all-pricing.js';

describe('quoteUnlockAll (M-23)', () => {
  it('sums the locked episodes and applies the discount rounded up', () => {
    expect(quoteUnlockAll(7, 10, 0)).toEqual({
      lockedCount: 7,
      fullPrice: 70,
      discountPercent: 0,
      price: 70,
    });
    expect(quoteUnlockAll(7, 10, 15)).toEqual({
      lockedCount: 7,
      fullPrice: 70,
      discountPercent: 15,
      price: 60,
    });
    expect(quoteUnlockAll(3, 7, 33)).toEqual({
      lockedCount: 3,
      fullPrice: 21,
      discountPercent: 33,
      price: 15,
    });
  });

  it('clamps the discount and handles an already unlocked series', () => {
    expect(quoteUnlockAll(0, 10, 20).price).toBe(0);
    expect(quoteUnlockAll(2, 10, 150)).toMatchObject({ discountPercent: 100, price: 0 });
    expect(quoteUnlockAll(2, 10, -5)).toMatchObject({ discountPercent: 0, price: 20 });
  });
});
