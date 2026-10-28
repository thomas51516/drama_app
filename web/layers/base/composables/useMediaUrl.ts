import { resolveMockAssetUrl, isMockAssetUrl } from '../mocks/assets'

/**
 * Resolves storage keys and URLs returned by the API into something the browser can load:
 * - absolute http(s)/blob/data URLs are returned as-is,
 * - `mock://assets/...` (mock mode) resolves to the object URL of the uploaded blob,
 * - anything else is a key under the CDN base (`NUXT_PUBLIC_CDN_BASE_URL`, e.g. `hls/{id}/master.m3u8`).
 */
export function useMediaUrl() {
  const config = useRuntimeConfig()
  const cdnBase = String(config.public.cdnBaseUrl ?? '').replace(/\/+$/, '')

  function resolve(value: string | null | undefined): string | null {
    if (!value) return null
    if (/^(https?:|blob:|data:)/i.test(value)) return value
    if (isMockAssetUrl(value)) return resolveMockAssetUrl(value)
    return `${cdnBase}/${value.replace(/^\/+/, '')}`
  }

  return { cdnBase, resolve }
}
