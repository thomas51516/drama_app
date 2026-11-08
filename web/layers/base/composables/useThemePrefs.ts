import { computed } from 'vue'

export const THEME_COOKIE = 'drama_theme'

export const THEMES = ['light', 'dark'] as const
export type Theme = (typeof THEMES)[number]

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value)
}

/**
 * Light/dark preference, shared by both apps (admin and recharge extend the same layer).
 * Persisted for a year in a cookie so SSR (recharge) and the first paint both already carry the
 * right theme, with no flash of the other one. Defaults to light, the historical, only theme.
 */
export function useThemePrefs() {
  const cookie = useCookie<string | null>(THEME_COOKIE, {
    sameSite: 'lax',
    secure: !import.meta.dev,
    path: '/',
    maxAge: 31_536_000,
    default: () => null,
  })

  const theme = computed<Theme>({
    get: () => (isTheme(cookie.value) ? cookie.value : 'light'),
    set: (value) => {
      cookie.value = value
    },
  })

  const isDark = computed(() => theme.value === 'dark')

  function toggle(): void {
    theme.value = isDark.value ? 'light' : 'dark'
  }

  return { theme, isDark, toggle }
}
