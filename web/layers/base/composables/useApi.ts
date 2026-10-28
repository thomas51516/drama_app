import { FetchError } from 'ofetch'
import { ApiError } from '../utils/api-error'
import type { ApiErrorBody } from '../types/api'
import { isAuthRoute, mockRequest, type MockMethod } from '../mocks'
import { useAuthStore } from '../stores/auth'
import { useNotify } from './useNotify'

export interface ApiRequestOptions {
  method?: MockMethod
  body?: unknown
  query?: Record<string, string | number | boolean | undefined>
  headers?: Record<string, string>
  signal?: AbortSignal
}

export interface ApiClient {
  request<T>(path: string, options?: ApiRequestOptions): Promise<T>
  get<T>(path: string, options?: Omit<ApiRequestOptions, 'method' | 'body'>): Promise<T>
  post<T>(
    path: string,
    body?: unknown,
    options?: Omit<ApiRequestOptions, 'method' | 'body'>,
  ): Promise<T>
  put<T>(
    path: string,
    body?: unknown,
    options?: Omit<ApiRequestOptions, 'method' | 'body'>,
  ): Promise<T>
  patch<T>(
    path: string,
    body?: unknown,
    options?: Omit<ApiRequestOptions, 'method' | 'body'>,
  ): Promise<T>
  delete<T>(path: string, options?: Omit<ApiRequestOptions, 'method' | 'body'>): Promise<T>
  /** True when responses come from `layers/base/mocks` instead of the network. */
  readonly isMock: boolean
}

function toApiError(error: unknown): ApiError {
  if (ApiError.is(error)) return error
  if (error instanceof FetchError) {
    const status = error.response?.status ?? 0
    // Backend errors follow ApiErrorDto; class-validator may still return `message: string[]`.
    const data = error.data as (Partial<ApiErrorBody> & { message?: string | string[] }) | undefined
    const message = Array.isArray(data?.message)
      ? data.message.join(', ')
      : (data?.message ?? error.message)
    return new ApiError(status, message, error.data)
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new ApiError(0, 'Request aborted', { code: 'ABORTED' })
  }
  return new ApiError(0, error instanceof Error ? error.message : 'Network error')
}

/**
 * Typed HTTP client for the backend API.
 * - base URL from `runtimeConfig.public.apiBase`
 * - `Authorization: Bearer <token>` from the auth store
 * - a 401 outside the login flow clears the session and redirects to /login
 * - a 403 shows the "Droits insuffisants" toast (the caller still receives the ApiError)
 * - `runtimeConfig.public.apiMock` switches to the in-memory fixtures (no network at all)
 */
export function useApi(): ApiClient {
  const config = useRuntimeConfig()
  const auth = useAuthStore()
  const isMock = Boolean(config.public.apiMock)

  async function handleUnauthorized(path: string): Promise<void> {
    if (isAuthRoute(path)) return
    auth.clearSession()
    const route = useRoute()
    if (route.path !== '/login') {
      await navigateTo({ path: '/login', query: { redirect: route.fullPath } })
    }
  }

  async function request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
    const method = options.method ?? 'GET'
    try {
      if (isMock) {
        const query = options.query
          ? `?${new URLSearchParams(
              Object.entries(options.query)
                .filter(([, value]) => value !== undefined)
                .map(([key, value]) => [key, String(value)]),
            ).toString()}`
          : ''
        return await mockRequest<T>({
          method,
          path: `${path}${query}`,
          body: options.body,
          token: auth.token,
        })
      }

      return await $fetch<T>(path, {
        baseURL: config.public.apiBase,
        method,
        body: options.body as Record<string, unknown> | undefined,
        query: options.query,
        signal: options.signal,
        headers: {
          Accept: 'application/json',
          ...(auth.token ? { Authorization: `Bearer ${auth.token}` } : {}),
          ...options.headers,
        },
        retry: 0,
      })
    } catch (error) {
      const apiError = toApiError(error)
      if (apiError.status === 401) {
        await handleUnauthorized(path)
      } else if (apiError.status === 403) {
        useNotify().error(useNuxtApp().$i18n.t('errors.forbidden'), apiError.message)
      }
      throw apiError
    }
  }

  return {
    isMock,
    request,
    get: (path, options) => request(path, { ...options, method: 'GET' }),
    post: (path, body, options) => request(path, { ...options, method: 'POST', body }),
    put: (path, body, options) => request(path, { ...options, method: 'PUT', body }),
    patch: (path, body, options) => request(path, { ...options, method: 'PATCH', body }),
    delete: (path, options) => request(path, { ...options, method: 'DELETE' }),
  }
}
