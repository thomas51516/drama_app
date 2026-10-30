/** Devises affichées dans la boutique (cahier des charges §10, contrat v1.4 `Price.currency`). */
export const CURRENCIES = ['XOF', 'NGN', 'GHS', 'EUR', 'USD'] as const;
export type Currency = (typeof CURRENCIES)[number];

export const FALLBACK_CURRENCY: Currency = 'USD';

export interface Price {
  currency: Currency;
  /** Montant en unité mineure (centimes ; FCFA sans décimale). */
  amountMinor: number;
}

const EURO_COUNTRIES = new Set([
  'AT',
  'BE',
  'CY',
  'DE',
  'EE',
  'ES',
  'FI',
  'FR',
  'GR',
  'HR',
  'IE',
  'IT',
  'LT',
  'LU',
  'LV',
  'MT',
  'NL',
  'PT',
  'SI',
  'SK',
  'AD',
  'MC',
  'SM',
  'VA',
  'ME',
  'XK',
  'BG',
]);
const XOF_COUNTRIES = new Set(['TG', 'CI', 'SN', 'BJ', 'BF', 'ML', 'NE', 'GW']);

/** Devise d'un pays (ISO 3166-1 alpha-2) : UEMOA → XOF, NG → NGN, GH → GHS, zone euro → EUR, sinon USD. */
export function currencyForCountry(country: string | null | undefined): Currency {
  const code = country?.toUpperCase();
  if (!code) return FALLBACK_CURRENCY;
  if (XOF_COUNTRIES.has(code)) return 'XOF';
  if (code === 'NG') return 'NGN';
  if (code === 'GH') return 'GHS';
  if (EURO_COUNTRIES.has(code)) return 'EUR';
  return FALLBACK_CURRENCY;
}

export function isCurrency(value: unknown): value is Currency {
  return typeof value === 'string' && (CURRENCIES as readonly string[]).includes(value);
}

/** Liste de prix stockée en JSON sur un pack ou une formule, nettoyée. */
export function parsePrices(raw: unknown): Price[] {
  if (!Array.isArray(raw)) return [];
  const out: Price[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const { currency, amountMinor } = item as { currency?: unknown; amountMinor?: unknown };
    if (isCurrency(currency) && typeof amountMinor === 'number' && Number.isInteger(amountMinor)) {
      out.push({ currency, amountMinor });
    }
  }
  return out;
}

/** Prix dans la devise demandée, repli USD ; `null` si aucun des deux n'est défini. */
export function resolvePrice(prices: Price[], currency: Currency): Price | null {
  return (
    prices.find((p) => p.currency === currency) ??
    prices.find((p) => p.currency === FALLBACK_CURRENCY) ??
    null
  );
}
