/**
 * Contracts of the admin API consumed by the web apps.
 * Mirrors docs/api (OpenAPI) once the backend exposes the endpoints (S03-BE-01, S03-BE-04).
 * Until then these types drive both the real client and the mock mode.
 */

export type AdminRole = 'admin' | 'editor' | 'monetization' | 'support'

export interface AdminUser {
  id: string
  email: string
  displayName: string
  role: AdminRole
  totpEnabled: boolean
}

/** POST /admin/auth/login */
export interface LoginRequest {
  email: string
  password: string
}

/**
 * The password step never returns a session: TOTP is mandatory (§11).
 * - `totp_required`: the account already has TOTP enrolled, ask for a code.
 * - `totp_setup_required`: first login, the account must enrol before getting a session.
 */
export type LoginResponse =
  | { status: 'totp_required'; challengeToken: string }
  | {
      status: 'totp_setup_required'
      challengeToken: string
      otpauthUri: string
      secret: string
    }

/** POST /admin/auth/totp/verify */
export interface TotpVerifyRequest {
  challengeToken: string
  code: string
}

export interface TotpVerifyResponse {
  accessToken: string
  expiresIn: number
  user: AdminUser
}

export type SeriesStatus = 'draft' | 'published' | 'archived'

/** Item of GET /admin/series */
export interface SeriesSummary {
  id: string
  title: string
  status: SeriesStatus
  episodesCount: number
  updatedAt: string
}

export interface Paginated<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export interface ApiErrorBody {
  statusCode: number
  message: string | string[]
  error?: string
}
