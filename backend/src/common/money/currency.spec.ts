import { currencyForCountry, parsePrices, resolvePrice } from './currency.js';

describe('currencyForCountry (S07-BE-06, shop prices per country)', () => {
  it('maps UEMOA countries to XOF, NG to NGN, GH to GHS and the euro area to EUR', () => {
    for (const c of ['TG', 'CI', 'SN', 'BJ', 'BF', 'ML', 'NE'])
      expect(currencyForCountry(c)).toBe('XOF');
    expect(currencyForCountry('NG')).toBe('NGN');
    expect(currencyForCountry('GH')).toBe('GHS');
    expect(currencyForCountry('FR')).toBe('EUR');
    expect(currencyForCountry('de')).toBe('EUR');
  });

  it('falls back to USD for unknown or missing countries', () => {
    expect(currencyForCountry('US')).toBe('USD');
    expect(currencyForCountry('CM')).toBe('USD');
    expect(currencyForCountry(null)).toBe('USD');
    expect(currencyForCountry(undefined)).toBe('USD');
  });
});

describe('resolvePrice', () => {
  const prices = parsePrices([
    { currency: 'XOF', amountMinor: 1000 },
    { currency: 'USD', amountMinor: 199 },
    { currency: 'ZZZ', amountMinor: 1 },
    { currency: 'EUR', amountMinor: 1.5 },
  ]);

  it('ignores malformed entries and picks the requested currency', () => {
    expect(prices).toHaveLength(2);
    expect(resolvePrice(prices, 'XOF')).toEqual({ currency: 'XOF', amountMinor: 1000 });
  });

  it('falls back to USD, then to null', () => {
    expect(resolvePrice(prices, 'NGN')).toEqual({ currency: 'USD', amountMinor: 199 });
    expect(resolvePrice([{ currency: 'EUR', amountMinor: 100 }], 'NGN')).toBeNull();
  });
});
