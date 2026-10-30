/**
 * Contracts of the admin API consumed by the web apps.
 * Source of truth: docs/api/admin-contract-v1.md, the back-office section of
 * docs/api/public-contract-v1.2.md and docs/api/contract-v1.3-sprint5.md (binding for backend
 * and back-office).
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

/** POST /admin/auth/login (`deviceToken`: trusted device of contract v1.3, B-13+). */
export interface LoginRequest {
  email: string
  password: string
  deviceToken?: string
}

/**
 * The password step never returns a session unless a valid trusted-device token is sent (§11,
 * contract v1.3):
 * - `totp_required`: the account already has TOTP enrolled, ask for a code.
 * - `totp_setup_required`: first login, the account must enrol with `secret` / `otpauthUri`.
 * - `ok`: the `deviceToken` was valid for this account, the session opens without a code.
 * The `challengeToken` expires after 5 minutes. An invalid device token is silently ignored.
 */
export type LoginResponse =
  | { status: 'totp_required'; challengeToken: string }
  | {
      status: 'totp_setup_required'
      challengeToken: string
      secret: string
      otpauthUri: string
    }
  | { status: 'ok'; accessToken: string; expiresIn: number; user: AdminUser }

/** POST /admin/auth/totp/verify */
export interface TotpVerifyRequest {
  challengeToken: string
  code: string
  /** Ask for a 30-day trusted-device token (contract v1.3). */
  rememberDevice?: boolean
}

export interface TotpVerifyResponse {
  accessToken: string
  expiresIn: number
  user: AdminUser
  /** Present when `rememberDevice` was true: random 256-bit token, hashed server-side. */
  deviceToken?: string
  deviceTokenExpiresAt?: string
}

// ---------------------------------------------------------------------------
// Trusted devices (B-13+) — contract v1.3
// ---------------------------------------------------------------------------

/** Lifetime of a trusted device and of the `drama_admin_device` cookie (30 days). */
export const TRUSTED_DEVICE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60

/** Item of GET /admin/auth/devices. */
export interface TrustedDevice {
  id: string
  /** Human label derived from the user agent (`Chrome · Linux`), may be empty. */
  label: string | null
  createdAt: string
  lastUsedAt: string | null
  expiresAt: string
  /** Optional hint of the backend: the device whose token opened the current session. */
  current?: boolean
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

/**
 * PATCH /admin/series/{id}: editable fields plus the scheduled publication date (B-04,
 * public contract v1.2). `publishedAt` is an ISO date-time in UTC; a future value hides the
 * series from the public catalogue until the date; `null` clears the schedule.
 */
export type AdminSeriesUpdateInput = Partial<AdminSeriesInput> & { publishedAt?: string | null }

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
// Scheduling (B-04) — public contract v1.2, back-office section
// ---------------------------------------------------------------------------

/** IANA time zone used to display and enter publication dates (dates are stored in UTC). */
export const SCHEDULE_TIME_ZONE = 'Africa/Lome'

export type ScheduleItemKind = 'SERIES' | 'EPISODE'

/**
 * Wire shape of one item of `GET /admin/schedule?from&to` as the backend sends it (sprint 4):
 * a series (its `publishedAt`) or an episode, always with its series for context.
 */
export interface ScheduleApiItem {
  kind: 'series' | 'episode'
  /** Series id for a series item, episode id for an episode item. */
  id: string
  seriesId: string
  seriesTitle: string
  seriesStatus: SeriesStatus
  episodeNumber: number | null
  episodeTitle: string | null
  transcodeStatus: TranscodeStatus | null
  publishedAt: string
  /** False when the date will pass without effect (draft series, episode not READY). */
  willBeVisible: boolean
}

export interface ScheduleApiResponse {
  items: ScheduleApiItem[]
  from: string
  to: string
}

/** Normalised item used by the pages (see `normalizeScheduleResponse()`); `publishedAt` is ISO UTC. */
export interface ScheduleItem {
  kind: ScheduleItemKind
  id: string
  seriesId: string
  seriesTitle: string
  /** Series title or episode title. */
  title: string
  /** Only for episodes. */
  episodeNumber: number | null
  publishedAt: string
  /** `SeriesStatus` for a series, `TranscodeStatus` for an episode. */
  status: string
  /** `null` when the API does not say. */
  willBeVisible: boolean | null
}

/** Query of GET /admin/schedule (ISO date-time bounds, inclusive). */
export interface ScheduleQuery {
  from: string
  to: string
}

// ---------------------------------------------------------------------------
// Dashboard v0 (B-11) — public contract v1.2, back-office section
// ---------------------------------------------------------------------------

export const STATS_PERIODS = [7, 30] as const
export type StatsPeriod = (typeof STATS_PERIODS)[number]

export interface StatsTopSeries {
  seriesId: string
  title: string
  viewers: number
  completions: number
}

/** GET /admin/stats/overview?days=7|30 (computed from `users` and `watch_progress`, cached 5 min). */
export interface StatsOverview {
  activeUsers: { d1: number; d7: number; d30: number }
  newUsers: number
  registeredUsers: number
  guestUsers: number
  episodesStarted: number
  episodesCompleted: number
  topSeries: StatsTopSeries[]
  generatedAt: string
}

// ---------------------------------------------------------------------------
// Push campaigns (B-10) — contract v1.3
// ---------------------------------------------------------------------------

export type CampaignSegmentType = 'ALL' | 'COUNTRY' | 'SERIES_FOLLOWERS' | 'INACTIVE'
export const CAMPAIGN_SEGMENT_TYPES: readonly CampaignSegmentType[] = [
  'ALL',
  'COUNTRY',
  'SERIES_FOLLOWERS',
  'INACTIVE',
]

export type CampaignStatus = 'DRAFT' | 'SCHEDULED' | 'SENDING' | 'SENT' | 'CANCELLED'
export const CAMPAIGN_STATUSES: readonly CampaignStatus[] = [
  'DRAFT',
  'SCHEDULED',
  'SENDING',
  'SENT',
  'CANCELLED',
]

/** Audience of a campaign; only the field of the chosen `type` is meaningful. */
export interface CampaignSegment {
  type: CampaignSegmentType
  /** ISO 3166-1 alpha-2 codes, for `COUNTRY`. */
  countries?: string[]
  /** For `SERIES_FOLLOWERS`. */
  seriesId?: string | null
  /** Days without activity, for `INACTIVE`. */
  inactiveDays?: number | null
}

export interface Campaign {
  id: string
  title: string
  /** Push body, at most `CAMPAIGN_BODY_MAX` characters. */
  body: string
  /** `drama://series/{id}` or any `drama://` deep link; `null` opens the home. */
  deepLink: string | null
  segment: CampaignSegment
  /** ISO UTC; `null` means "send now" when sent. */
  scheduledAt: string | null
  status: CampaignStatus
  audienceCount: number
  sentCount: number
  createdBy: string
  createdAt: string
  /** Optional timestamps the backend may add. */
  updatedAt?: string | null
  sentAt?: string | null
  cancelledAt?: string | null
}

/** Push body limit of the contract (B-10). */
export const CAMPAIGN_BODY_MAX = 178
export const CAMPAIGN_TITLE_MAX = 60

/** POST /admin/campaigns and PATCH /admin/campaigns/{id}. */
export type CampaignInput = Pick<Campaign, 'title' | 'body' | 'segment'> & {
  deepLink?: string | null
  scheduledAt?: string | null
}

/** POST /admin/campaigns/{id}/estimate */
export interface CampaignEstimate {
  audienceCount: number
}

// ---------------------------------------------------------------------------
// Help center: FAQ and support (M-53, B-03bis) — contract v1.3
// ---------------------------------------------------------------------------

export const FAQ_LANGUAGES = ['fr', 'en', 'es', 'pt'] as const
export type FaqLanguage = (typeof FAQ_LANGUAGES)[number]

/** French is required and is the fallback; the backend may return `null` for the others. */
export type FaqLocalized = { fr: string } & Partial<Record<'en' | 'es' | 'pt', string | null>>

export interface FaqEntry {
  id: string
  /** Category key (`account`, `coins`, `playback`, …), see `FAQ_CATEGORIES`. */
  category: string
  question: FaqLocalized
  answer: FaqLocalized
  /** Global order (1..n) across categories. */
  position: number
  isPublished: boolean
}

/** POST /admin/faq and PATCH /admin/faq/{id}. */
export type FaqEntryInput = Partial<
  Pick<FaqEntry, 'category' | 'question' | 'answer' | 'isPublished'>
>

/** PUT /admin/faq/order */
export interface FaqOrderInput {
  ids: string[]
}

/** GET /help/faq?lang — published entries in the requested language with French fallback. */
export interface PublicFaqResponse {
  categories: {
    key: string
    title: string
    entries: { id: string; question: string; answer: string }[]
  }[]
}

export type SupportTicketStatus = 'OPEN' | 'ANSWERED' | 'CLOSED'
export const SUPPORT_TICKET_STATUSES: readonly SupportTicketStatus[] = [
  'OPEN',
  'ANSWERED',
  'CLOSED',
]

export interface SupportMessage {
  from: 'user' | 'support'
  body: string
  at: string
}

export interface SupportTicket {
  id: string
  userId: string
  /** Display name, e-mail or masked identifier of the user. */
  userLabel: string
  category: string
  subject: string
  status: SupportTicketStatus
  messages: SupportMessage[]
  createdAt: string
  updatedAt: string
}

/** Query of GET /admin/support/tickets */
export interface SupportTicketQuery {
  status?: SupportTicketStatus
  page?: number
  pageSize?: number
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
