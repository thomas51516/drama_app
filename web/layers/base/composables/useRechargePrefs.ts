import { computed } from 'vue'
import { DEFAULT_RECHARGE_COUNTRY, isRechargeCountry } from '../utils/topup'

export const COUNTRY_COOKIE = 'drama_country'
export const LANGUAGE_COOKIE = 'drama_lang'

export const RECHARGE_LANGUAGES = ['fr', 'en', 'es', 'pt'] as const
export type RechargeLanguage = (typeof RECHARGE_LANGUAGES)[number]

export function isRechargeLanguage(value: unknown): value is RechargeLanguage {
  return typeof value === 'string' && (RECHARGE_LANGUAGES as readonly string[]).includes(value)
}

/**
 * Visitor preferences of the recharge site, persisted in cookies for a year so SSR renders the
 * right country and language on the first byte: `drama_country` (ISO alpha-2, drives the
 * `X-Country` of `/shop`) and `drama_lang` (fr by default).
 */
export function useRechargePrefs() {
  const options = {
    sameSite: 'lax' as const,
    secure: !import.meta.dev,
    path: '/',
    maxAge: 31_536_000,
  }
  const countryCookie = useCookie<string | null>(COUNTRY_COOKIE, {
    ...options,
    default: () => null,
  })
  const languageCookie = useCookie<string | null>(LANGUAGE_COOKIE, {
    ...options,
    default: () => null,
  })

  const country = computed<string>({
    get: () =>
      isRechargeCountry(countryCookie.value) ? countryCookie.value : DEFAULT_RECHARGE_COUNTRY,
    set: (value) => {
      countryCookie.value = isRechargeCountry(value) ? value : null
    },
  })

  const language = computed<RechargeLanguage | null>({
    get: () => (isRechargeLanguage(languageCookie.value) ? languageCookie.value : null),
    set: (value) => {
      languageCookie.value = value
    },
  })

  /** True when the visitor picked a country (otherwise the account country may win). */
  const hasCountry = computed(() => isRechargeCountry(countryCookie.value))

  return { country, hasCountry, language }
}
