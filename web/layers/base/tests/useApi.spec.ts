import { beforeEach, describe, expect, it } from 'vitest'
import { useApi } from '../composables/useApi'
import { useAuthStore } from '../stores/auth'
import { mockCredentials } from '../mocks'
import type { Paginated, SeriesSummary } from '../types/api'

async function signIn(): Promise<void> {
  const auth = useAuthStore()
  await auth.login(mockCredentials.email, mockCredentials.password)
  await auth.verifyTotp(mockCredentials.totpCode)
}

describe('useApi() in mock mode', () => {
  beforeEach(() => {
    useAuthStore().clearSession()
  })

  it('reports mock mode from runtime config', () => {
    expect(useRuntimeConfig().public.apiMock).toBe(true)
    expect(useApi().isMock).toBe(true)
  })

  it('returns the series fixtures when a session exists', async () => {
    await signIn()
    const api = useApi()
    const page = await api.get<Paginated<SeriesSummary>>('/admin/series', {
      query: { page: 1, pageSize: 50 },
    })

    expect(page.total).toBeGreaterThan(0)
    expect(page.items).toHaveLength(page.total)
    expect(page.items[0]).toMatchObject({
      id: expect.any(String),
      title: expect.any(String),
      episodesCount: expect.any(Number),
    })
    expect(['draft', 'published', 'archived']).toContain(page.items[0]?.status)
  })

  it('rejects protected routes with 401 and clears the session when no token is set', async () => {
    const api = useApi()
    await expect(api.get('/admin/series')).rejects.toMatchObject({ status: 401 })
    expect(useAuthStore().isAuthenticated).toBe(false)
  })

  it('clears an existing session on 401 (expired token)', async () => {
    await signIn()
    const auth = useAuthStore()
    const api = useApi()
    // Simulate a token the server no longer accepts.
    auth.token = 'expired-token'
    expect(auth.isAuthenticated).toBe(true)

    await expect(api.get('/admin/auth/me')).rejects.toMatchObject({ status: 401 })
    expect(auth.isAuthenticated).toBe(false)
    expect(auth.user).toBeNull()
  })

  it('returns 404 ApiError for unknown mock routes', async () => {
    await signIn()
    await expect(useApi().get('/admin/does-not-exist')).rejects.toMatchObject({
      name: 'ApiError',
      status: 404,
    })
  })
})
