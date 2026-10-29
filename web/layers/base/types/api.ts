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
// Subtitles (B-03) — addendum v1.1
// ---------------------------------------------------------------------------

/** Languages offered first in the subtitle language picker; any ISO 639-1 code is accepted. */
export const SUBTITLE_LANGUAGES = ['fr', 'en', 'es', 'pt'] as const
export type KnownSubtitleLanguage = (typeof SUBTITLE_LANGUAGES)[number]

export interface Subtitle {
  id: string
  episodeId: string
  /** ISO 639-1 code (`fr`, `en`, `es`, `pt`, …). One subtitle per language and episode. */
  language: string
  /** Public URL of the VTT file (SRT is converted server-side). */
  fileUrl: string
  label: string | null
  createdAt: string
}

/** Limits of `POST /admin/episodes/{id}/subtitles` (multipart `file` + `language`). */
export const SUBTITLE_MAX_FILE_BYTES = 2 * 1024 * 1024
export const SUBTITLE_ACCEPTED_EXTENSIONS = ['.srt', '.vtt'] as const

// ---------------------------------------------------------------------------
// Home curation (B-05) — addendum v1.1
// ---------------------------------------------------------------------------

export interface HomeBanner {
  id: string
  seriesId: string
  imageUrl: string | null
  title: string
  subtitle: string | null
  /** ISO 3166-1 alpha-2 codes; empty = shown everywhere. */
  countries: string[]
  position: number
  isActive: boolean
  startsAt: string | null
  endsAt: string | null
}

/** Editable fields of POST /admin/home/banners and PATCH /admin/home/banners/{id}. */
export type HomeBannerInput = Partial<Omit<HomeBanner, 'id' | 'position'>>

export type HomeRowType = 'MANUAL' | 'TRENDING' | 'NEW' | 'GENRE' | 'CONTINUE_WATCHING'
export const HOME_ROW_TYPES: readonly HomeRowType[] = [
  'MANUAL',
  'TRENDING',
  'NEW',
  'GENRE',
  'CONTINUE_WATCHING',
]

export const HOME_TITLE_LANGUAGES = ['fr', 'en', 'es', 'pt'] as const
export type HomeTitleLanguage = (typeof HOME_TITLE_LANGUAGES)[number]
/** French is the fallback language and is required; the backend may return `null` for the others. */
export type HomeRowTitles = { fr: string } & Partial<Record<'en' | 'es' | 'pt', string | null>>

/** Unique key of a row, chosen by the editor (backend rule: 2 to 80 chars, `[a-z0-9_-]`). */
export const HOME_ROW_KEY_RE = /^[a-z0-9][a-z0-9_-]{1,79}$/

export interface HomeRow {
  id: string
  /** Stable key exposed to the app (`trending`, `new`, `genre-romance`, …), unique. */
  key: string
  type: HomeRowType
  titles: HomeRowTitles
  /** Only for `GENRE` rows. */
  genre: string | null
  /** Ordered list, only for `MANUAL` rows. */
  seriesIds: string[]
  countries: string[]
  position: number
  isActive: boolean
}

/** Editable fields of POST /admin/home/rows and PATCH /admin/home/rows/{id} (`key` required on create). */
export type HomeRowInput = Partial<Omit<HomeRow, 'id' | 'position'>>

/** PUT /admin/home/banners/order and /admin/home/rows/order */
export interface HomeOrderInput {
  ids: string[]
}

/** GET /admin/home/preview?country&lang */
export interface HomePreviewQuery {
  country: string
  lang: string
}

/** `SeriesSummaryDto` of the public API (what the app renders in a poster card). */
export interface PublicSeriesSummary {
  id: string
  slug: string
  title: string
  genres: string[]
  posterVerticalUrl: string | null
  posterHorizontalUrl: string | null
  episodeCount: number
  freeEpisodeCount: number
  coinCostPerEpisode: number
  ageRating: AgeRating
  publishedAt: string | null
}

export interface PublicHomeItem {
  series: PublicSeriesSummary
  episode?: { id: string; number: number; title: string | null } | null
  positionSeconds?: number
}

export interface PublicHomeRow {
  key: string
  title: string
  type?: HomeRowType
  items: PublicHomeItem[]
}

/**
 * Banner of the public `GET /home`. The backend may send either the series summary directly
 * (v1 shape) or the curated banner with its `series`; `normalizeHomePreview()` handles both.
 */
export type PublicHomeBanner = Partial<PublicSeriesSummary> & {
  seriesId?: string
  imageUrl?: string | null
  subtitle?: string | null
  series?: PublicSeriesSummary | null
}

/** Response of the public `GET /home`, returned as-is by `GET /admin/home/preview`. */
export interface PublicHomeResponse {
  banners: PublicHomeBanner[]
  rows: PublicHomeRow[]
}

// ---------------------------------------------------------------------------
// Internal accounts and audit log (B-13) — addendum v1.1
// ---------------------------------------------------------------------------

export interface AdminAccount {
  id: string
  email: string
  displayName: string
  role: AdminRole
  isActive: boolean
  totpEnrolled: boolean
  lastLoginAt: string | null
  createdAt: string
}

/** POST /admin/accounts */
export interface AdminAccountCreateInput {
  email: string
  displayName: string
  role: AdminRole
  password: string
}

/** PATCH /admin/accounts/{id} */
export interface AdminAccountUpdateInput {
  displayName?: string
  role?: AdminRole
  isActive?: boolean
}

/** POST /admin/accounts/{id}/reset-password */
export interface AdminAccountResetPasswordInput {
  password: string
}

export interface AuditLog {
  id: string
  actorId: string | null
  actorEmail: string | null
  /** Stable verb `<target>.<action>` (`series.update`, `home_banner.create`, `admin.login`…). */
  action: string
  targetType: string
  targetId: string | null
  oldValue: unknown
  newValue: unknown
  ip: string | null
  createdAt: string
}

/** Query of GET /admin/audit-logs */
export interface AuditLogQuery {
  page?: number
  pageSize?: number
  actorId?: string
  action?: string
  targetType?: string
  targetId?: string
  /** ISO date-time bounds (inclusive). */
  from?: string
  to?: string
}

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
