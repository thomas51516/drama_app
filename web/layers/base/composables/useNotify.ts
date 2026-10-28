import type { ToastServiceMethods } from 'primevue/toastservice'
import { ApiError } from '../utils/api-error'

export interface Notifier {
  success(summary: string, detail?: string): void
  info(summary: string, detail?: string): void
  warn(summary: string, detail?: string): void
  error(summary: string, detail?: string): void
  /** Toast a failed API call with a French message derived from its status/code. */
  apiError(error: unknown, fallbackSummary?: string): void
}

const DEFAULT_LIFE_MS = 4500

/**
 * Toast notifications usable anywhere (pages, stores, the API client): PrimeVue's ToastService
 * is read from the Vue app rather than injected, so it also works outside component setup.
 * Silently no-ops when the `<Toast />` outlet / service is absent (unit tests).
 */
export function useNotify(): Notifier {
  const nuxtApp = useNuxtApp()
  const { t } = nuxtApp.$i18n
  const toast = (nuxtApp.vueApp.config.globalProperties as { $toast?: ToastServiceMethods }).$toast

  function add(
    severity: 'success' | 'info' | 'warn' | 'error',
    summary: string,
    detail?: string,
  ): void {
    toast?.add({ severity, summary, detail, life: severity === 'error' ? 8000 : DEFAULT_LIFE_MS })
  }

  function describe(error: unknown): string {
    if (ApiError.is(error)) {
      if (error.status === 0) return t('errors.network')
      if (error.status === 403) return t('errors.forbidden')
      if (error.status === 404) return t('errors.notFound')
      if (error.status === 409) return error.message || t('errors.conflict')
      if (error.status >= 500) return t('errors.server', { status: error.status })
      return error.message || t('errors.generic', { status: error.status })
    }
    return error instanceof Error ? error.message : t('errors.generic', { status: '?' })
  }

  return {
    success: (summary, detail) => add('success', summary, detail),
    info: (summary, detail) => add('info', summary, detail),
    warn: (summary, detail) => add('warn', summary, detail),
    error: (summary, detail) => add('error', summary, detail),
    apiError: (error, fallbackSummary) => {
      // 401 is handled globally by the API client (redirect to /login), 403 is toasted there too.
      if (ApiError.is(error) && (error.status === 401 || error.status === 403)) return
      add('error', fallbackSummary ?? t('errors.title'), describe(error))
    },
  }
}
