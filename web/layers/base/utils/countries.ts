/**
 * ISO 3166-1 alpha-2 codes offered by the territories helper. Any valid two-letter code is
 * accepted by the form; this list only drives the suggestions and the "francophone" shortcut.
 */
export const COUNTRY_CODES: readonly string[] = [
  // Europe
  'FR',
  'BE',
  'CH',
  'LU',
  'MC',
  'DE',
  'ES',
  'IT',
  'PT',
  'GB',
  'IE',
  'NL',
  // Africa
  'CI',
  'SN',
  'CM',
  'ML',
  'BF',
  'BJ',
  'TG',
  'NE',
  'GN',
  'GA',
  'CG',
  'CD',
  'TD',
  'CF',
  'MG',
  'MA',
  'DZ',
  'TN',
  'MU',
  'RW',
  'BI',
  'DJ',
  'KM',
  'GH',
  'NG',
  'KE',
  'ZA',
  'AO',
  'MZ',
  // Americas
  'CA',
  'US',
  'HT',
  'BR',
  'MX',
  'AR',
  'CO',
  'CL',
  'PE',
  // Asia and Oceania
  'LB',
  'VN',
  'IN',
  'ID',
  'PH',
  'JP',
  'KR',
  'AU',
  'NZ',
]

/** Shortcut of the territories helper: francophone markets of the launch (§1 of the spec). */
export const FRANCOPHONE_CODES: readonly string[] = [
  'FR',
  'BE',
  'CH',
  'LU',
  'MC',
  'CA',
  'CI',
  'SN',
  'CM',
  'ML',
  'BF',
  'BJ',
  'TG',
  'NE',
  'GN',
  'GA',
  'CG',
  'CD',
  'TD',
  'CF',
  'MG',
  'MA',
  'DZ',
  'TN',
  'HT',
  'MU',
  'RW',
  'BI',
  'DJ',
  'KM',
]

export const ISO_COUNTRY_RE = /^[A-Z]{2}$/

export function isIsoCountryCode(value: string): boolean {
  return ISO_COUNTRY_RE.test(value)
}

export function normalizeCountryCode(value: string): string {
  return value.trim().toUpperCase()
}

const displayNamesCache = new Map<string, Intl.DisplayNames | null>()

/** Localised country name (Intl.DisplayNames), falling back to the code itself. */
export function countryName(code: string, locale = 'fr'): string {
  let names = displayNamesCache.get(locale)
  if (names === undefined) {
    try {
      names =
        typeof Intl.DisplayNames === 'function'
          ? new Intl.DisplayNames([locale], { type: 'region' })
          : null
    } catch {
      names = null
    }
    displayNamesCache.set(locale, names)
  }
  if (!names) return code
  try {
    return names.of(code) ?? code
  } catch {
    return code
  }
}

export interface CountryOption {
  code: string
  name: string
  label: string
}

export function countryOptions(locale = 'fr'): CountryOption[] {
  return COUNTRY_CODES.map((code) => {
    const name = countryName(code, locale)
    return { code, name, label: `${code} — ${name}` }
  }).sort((a, b) => a.name.localeCompare(b.name, locale))
}
