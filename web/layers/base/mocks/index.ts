import { ApiError } from '../utils/api-error'
import type {
  AdminUser,
  LoginRequest,
  LoginResponse,
  Paginated,
  SeriesSummary,
  TotpVerifyRequest,
  TotpVerifyResponse,
} from '../types/api'
import authFixture from './auth.json'
import seriesFixture from './series.json'

/**
 * In-memory implementation of the admin API used when `runtimeConfig.public.apiMock` is true.
 * Keep it dumb: fixtures in JSON files, a handful of routes, realistic error statuses.
 *
 * Demo credentials: admin@drama.local / Admin1234! / TOTP 123456
 */

export type MockMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface MockRequest {
  method: MockMethod
  path: string
  body?: unknown
  token?: string | null
}

type Handler = (request: MockRequest) => unknown

const MOCK_LATENCY_MS = 150

const authRoutes = new Set(['/admin/auth/login', '/admin/auth/totp/verify'])

function requireAuth(request: MockRequest): void {
  if (request.token !== authFixture.accessToken) {
    throw new ApiError(401, 'Unauthorized', { statusCode: 401, message: 'Unauthorized' })
  }
}

const handlers: Record<string, Handler> = {
  'POST /admin/auth/login': ({ body }): LoginResponse => {
    const { email, password } = (body ?? {}) as Partial<LoginRequest>
    const ok =
      email?.trim().toLowerCase() === authFixture.credentials.email &&
      password === authFixture.credentials.password
    if (!ok) {
      throw new ApiError(401, 'Invalid credentials', {
        statusCode: 401,
        message: 'Invalid credentials',
      })
    }
    if (!authFixture.user.totpEnabled) {
      return {
        status: 'totp_setup_required',
        challengeToken: authFixture.challengeToken,
        otpauthUri: authFixture.otpauthUri,
        secret: authFixture.secret,
      }
    }
    return { status: 'totp_required', challengeToken: authFixture.challengeToken }
  },

  'POST /admin/auth/totp/verify': ({ body }): TotpVerifyResponse => {
    const { challengeToken, code } = (body ?? {}) as Partial<TotpVerifyRequest>
    if (
      challengeToken !== authFixture.challengeToken ||
      code !== authFixture.credentials.totpCode
    ) {
      throw new ApiError(401, 'Invalid TOTP code', {
        statusCode: 401,
        message: 'Invalid TOTP code',
      })
    }
    return {
      accessToken: authFixture.accessToken,
      expiresIn: 8 * 3600,
      user: authFixture.user as AdminUser,
    }
  },

  'POST /admin/auth/logout': (request) => {
    requireAuth(request)
    return null
  },

  'GET /admin/auth/me': (request): AdminUser => {
    requireAuth(request)
    return authFixture.user as AdminUser
  },

  'GET /admin/series': (request): Paginated<SeriesSummary> => {
    requireAuth(request)
    const items = seriesFixture as SeriesSummary[]
    return { items, total: items.length, page: 1, pageSize: 50 }
  },
}

function stripQuery(path: string): string {
  const index = path.indexOf('?')
  return index === -1 ? path : path.slice(0, index)
}

/** Resolve a mock request. Throws `ApiError` like the real client would. */
export async function mockRequest<T>(request: MockRequest): Promise<T> {
  const path = stripQuery(request.path)
  const handler = handlers[`${request.method} ${path}`]
  await new Promise((resolve) => setTimeout(resolve, MOCK_LATENCY_MS))
  if (!handler) {
    throw new ApiError(404, `No mock for ${request.method} ${path}`, {
      statusCode: 404,
      message: 'Not Found',
    })
  }
  return handler({ ...request, path }) as T
}

export function isAuthRoute(path: string): boolean {
  return authRoutes.has(stripQuery(path))
}

export const mockCredentials = authFixture.credentials
