/**
 * Registry of files "uploaded" in mock mode. The mock API hands out `mock://upload/<key>` upload
 * URLs and `mock://assets/<key>` public URLs; the mock transport stores the blob here so that the
 * UI can display the real selected image/video for the rest of the session.
 */
const MOCK_UPLOAD_PREFIX = 'mock://upload/'
const MOCK_ASSET_PREFIX = 'mock://assets/'

const objectUrls = new Map<string, string>()

export function isMockUploadUrl(url: string): boolean {
  return url.startsWith(MOCK_UPLOAD_PREFIX)
}

export function isMockAssetUrl(url: string): boolean {
  return url.startsWith(MOCK_ASSET_PREFIX)
}

export function mockUploadUrlFor(key: string): string {
  return `${MOCK_UPLOAD_PREFIX}${key}`
}

export function mockAssetUrlFor(key: string): string {
  return `${MOCK_ASSET_PREFIX}${key}`
}

export function registerMockAsset(uploadUrl: string, file: Blob): void {
  if (!isMockUploadUrl(uploadUrl)) return
  const key = uploadUrl.slice(MOCK_UPLOAD_PREFIX.length)
  const previous = objectUrls.get(key)
  try {
    if (previous) URL.revokeObjectURL(previous)
    objectUrls.set(key, URL.createObjectURL(file))
  } catch {
    // Non-browser runtimes (tests) may not support object URLs for this blob type: no preview.
    objectUrls.delete(key)
  }
}

/** Object URL of a mock asset, or `null` when nothing was uploaded under that key (e.g. after a reload). */
export function resolveMockAssetUrl(url: string): string | null {
  if (!isMockAssetUrl(url)) return null
  return objectUrls.get(url.slice(MOCK_ASSET_PREFIX.length)) ?? null
}

export function clearMockAssets(): void {
  objectUrls.forEach((objectUrl) => {
    try {
      URL.revokeObjectURL(objectUrl)
    } catch {
      // ignore
    }
  })
  objectUrls.clear()
}
