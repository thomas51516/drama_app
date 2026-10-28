/**
 * Contracts of the admin API consumed by the web apps.
 * Source of truth: docs/api/admin-contract-v1.md (binding for backend and back-office).
 * These types drive both the real client and the mock mode.
 */

// ---------------------------------------------------------------------------
// Authentication (admin)
// ---------------------------------------------------------------------------

export type AdminRole = 'EDITOR' | 'MONETIZATION' | 'SUPPORT' | 'ADMIN'

export const ADMIN_ROLES: readonly AdminRole[] = ['EDITOR', 'MONETIZATION', 'SUPPORT', 'ADMIN']

export interface AdminUser {
  id: string
  email: string
  displayName: string
  role: AdminRole
}

/** POST /admin/auth/login */
export interface LoginRequest {
  email: string
  password: string
}

/**
 * The password step never returns a session: TOTP is mandatory (§11).
 * - `totp_required`: the account already has TOTP enrolled, ask for a code.
 * - `totp_setup_required`: first login, the account must enrol with `secret` / `otpauthUri`.
 * The `challengeToken` expires after 5 minutes.
 */
export type LoginResponse =
  | { status: 'totp_required'; challengeToken: string }
  | {
      status: 'totp_setup_required'
      challengeToken: string
      secret: string
      otpauthUri: string
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

// ---------------------------------------------------------------------------
// Series (B-01)
// ---------------------------------------------------------------------------

export type SeriesStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
export const SERIES_STATUSES: readonly SeriesStatus[] = ['DRAFT', 'PUBLISHED', 'ARCHIVED']

export type AgeRating = 'ALL' | 'PG12' | 'PG16' | 'R18'
export const AGE_RATINGS: readonly AgeRating[] = ['ALL', 'PG12', 'PG16', 'R18']

export type SeriesLanguage = 'fr' | 'en' | 'es' | 'pt'
export const SERIES_LANGUAGES: readonly SeriesLanguage[] = ['fr', 'en', 'es', 'pt']

/** Fixed genre list of the catalogue (keys are stored as-is by the API). */
export const SERIES_GENRES = [
  'romance',
  'drame',
  'comedie',
  'action',
  'thriller',
  'fantastique',
  'famille',
] as const
export type SeriesGenre = (typeof SERIES_GENRES)[number]

export interface AdminSeries {
  id: string
  slug: string
  title: string
  synopsis: string
  genres: string[]
  tags: string[]
  language: string
  ageRating: AgeRating
  posterVerticalUrl: string | null
  posterHorizontalUrl: string | null
  freeEpisodeCount: number
  coinCostPerEpisode: number
  status: SeriesStatus
  territories: string[]
  episodeCount: number
  publishedAt: string | null
  createdAt: string
  updatedAt: string
}

/** Editable fields of POST /admin/series and PATCH /admin/series/{id}. `slug` is derived server-side. */
export type AdminSeriesInput = Pick<
  AdminSeries,
  | 'title'
  | 'synopsis'
  | 'genres'
  | 'tags'
  | 'language'
  | 'ageRating'
  | 'posterVerticalUrl'
  | 'posterHorizontalUrl'
  | 'freeEpisodeCount'
  | 'coinCostPerEpisode'
  | 'territories'
>

/** Fields only MONETIZATION and ADMIN may change. */
export const MONETIZATION_FIELDS = ['freeEpisodeCount', 'coinCostPerEpisode'] as const

/** Query of GET /admin/series */
export interface AdminSeriesListQuery {
  page?: number
  pageSize?: number
  status?: SeriesStatus
  q?: string
}

export interface Paginated<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

// ---------------------------------------------------------------------------
// Episodes and upload (B-02)
// ---------------------------------------------------------------------------

export type TranscodeStatus = 'PENDING' | 'UPLOADED' | 'PROCESSING' | 'READY' | 'FAILED'
export const TRANSCODE_STATUSES: readonly TranscodeStatus[] = [
  'PENDING',
  'UPLOADED',
  'PROCESSING',
  'READY',
  'FAILED',
]

export interface AdminEpisode {
  id: string
  seriesId: string
  number: number
  title: string
  durationSeconds: number | null
  transcodeStatus: TranscodeStatus
  sourceKey: string | null
  /** `hls/{episodeId}/master.m3u8`, resolved against the CDN base URL for playback. */
  hlsKey: string | null
  thumbnailUrl: string | null
  previewKey: string | null
  publishedAt: string | null
  transcodeError: string | null
  createdAt: string
  updatedAt: string
}

/** POST /admin/series/{id}/episodes */
export interface AdminEpisodeCreateInput {
  title?: string
  number?: number
}

/** PATCH /admin/episodes/{id} */
export interface AdminEpisodeUpdateInput {
  title?: string
  publishedAt?: string | null
}

/** PUT /admin/series/{id}/episodes/order */
export interface AdminEpisodeOrderInput {
  episodeIds: string[]
}

/** POST /admin/episodes/{id}/upload-url */
export interface EpisodeUploadUrlRequest {
  fileName: string
  contentType: string
  sizeBytes: number
}

export interface EpisodeUploadUrlResponse {
  uploadUrl: string
  method: 'PUT'
  headers: Record<string, string>
  sourceKey: string
  expiresAt: string
}

/** POST /admin/uploads/presign */
export interface PresignRequest {
  kind: 'poster'
  fileName: string
  contentType: string
}

export interface PresignResponse {
  uploadUrl: string
  method: 'PUT'
  headers: Record<string, string>
  key: string
  publicUrl: string
}

/** Upload limits of the contract (single PUT; multipart comes later). */
export const EPISODE_MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024
export const EPISODE_ACCEPTED_TYPES = ['video/mp4', 'video/quicktime'] as const

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** `ApiErrorDto` of the backend (backend/src/common/dto/api-error.dto.ts). */
export interface ApiErrorBody {
  statusCode: number
  /** Stable code meant for the client (e.g. `SERIES_NO_READY_EPISODE`). */
  code: string
  message: string
  details?: Record<string, unknown>
  path: string
  timestamp: string
  requestId?: string
}
