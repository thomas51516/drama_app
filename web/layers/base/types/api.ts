/**
 * Contracts of the admin API consumed by the web apps.
 * Source of truth: docs/api/admin-contract-v1.md, the back-office section of
 * docs/api/public-contract-v1.2.md, docs/api/contract-v1.3-sprint5.md and
 * docs/api/contract-v1.4-sprint6.md and docs/api/contract-v1.5-sprint7.md (binding for backend,
 * back-office and the recharge site).
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
  /** The device whose token opened the current session (contract v1.4: always sent). */
  current: boolean
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
  /** Eligible to rewarded-ad unlocks (contract v1.5, default true). Optional for older payloads. */
  adUnlockEnabled?: boolean
  status: SeriesStatus
  territories: string[]
  episodeCount: number
  publishedAt: string | null
  /**
   * B-12, contract v1.6. Computed server-side, never stored: NONE (no contract), ACTIVE (inside the
   * license window), EXPIRED (contract outside the window — ended, or not yet started). Optional
   * for older payloads/fixtures; treat a missing value as `NONE`.
   */
  rightsStatus?: RightsStatus
  rightsContract?: RightsContract | null
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
  | 'adUnlockEnabled'
  | 'territories'
>

/**
 * PATCH /admin/series/{id}: editable fields plus the scheduled publication date (B-04,
 * public contract v1.2). `publishedAt` is an ISO date-time in UTC; a future value hides the
 * series from the public catalogue until the date; `null` clears the schedule.
 */
export type AdminSeriesUpdateInput = Partial<AdminSeriesInput> & { publishedAt?: string | null }

/** Fields only MONETIZATION and ADMIN may change. */
export const MONETIZATION_FIELDS = [
  'freeEpisodeCount',
  'coinCostPerEpisode',
  'adUnlockEnabled',
] as const

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
// Rights and contracts (B-12) — contract v1.6
// ---------------------------------------------------------------------------

export type RightsStatus = 'NONE' | 'ACTIVE' | 'EXPIRED'
export const RIGHTS_STATUSES: readonly RightsStatus[] = ['NONE', 'ACTIVE', 'EXPIRED']

/**
 * At most one current contract per series (1-1, no history — editing replaces the fields in
 * place). `licenseEndsAt: null` means an indefinite license.
 */
export interface RightsContract {
  id: string
  seriesId: string
  rightsHolder: string
  /** ISO 3166-1 alpha-2, same codes as `AdminSeries.territories`. Empty = worldwide. */
  territories: string[]
  licenseStartsAt: string
  licenseEndsAt: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

/** POST /admin/series/{id}/rights-contract (409 RIGHTS_CONTRACT_ALREADY_EXISTS if one exists). */
export type RightsContractInput = Pick<
  RightsContract,
  'rightsHolder' | 'territories' | 'licenseStartsAt' | 'licenseEndsAt' | 'notes'
>

/** PATCH /admin/series/{id}/rights-contract: changed fields only (404 if none registered). */
export type RightsContractUpdateInput = Partial<RightsContractInput>

/** GET /admin/rights-contracts?expiringWithinDays — renewal reminder list, one row per series. */
export interface RightsContractListItem {
  seriesId: string
  seriesTitle: string
  seriesStatus: SeriesStatus
  rightsStatus: RightsStatus
  contract: RightsContract | null
}

export interface RightsContractListQuery {
  /** Keep only NONE, EXPIRED, or ACTIVE ending within this many days. */
  expiringWithinDays?: number
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

/** Real money source of a `coin_ledger` PURCHASE line (never a promo code — that's BONUS). */
export type RevenueSource = 'GOOGLE_PLAY' | 'MOBILE_MONEY'

/**
 * B-11 (sprint 9): gross revenue credited on the window, by source and currency, from
 * `coin_ledger`/`purchases` — never the `wallets` projection. `GOOGLE_PLAY` can be empty in dev:
 * the `fake` billing verifier never fills `amountMinor` (only the real `google` verifier does).
 */
export interface StatsRevenueBySource {
  source: RevenueSource
  currency: string
  amountMinor: number
  orderCount: number
}

/**
 * B-11 (sprint 9): approximate paywall conversion. A user counts as converted when an `unlocks`
 * row (any method) falls within `windowHours` after one of their `paywall_view` events — there is
 * no shared session between `analytics_events` and `unlocks` to attribute this more precisely.
 */
export interface StatsPaywallConversion {
  paywallViewers: number
  convertedViewers: number
  conversionRate: number
  windowHours: number
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
  /** Optional for older fixtures/mocks; the real API always sends them. */
  paywallViews?: number
  unlocks?: number
  pushOpens?: number
  revenueBySource?: StatsRevenueBySource[]
  paywallConversion?: StatsPaywallConversion
  days?: number
  generatedAt: string
}

// ---------------------------------------------------------------------------
// Retention per episode (B-11, sprint 9) — GET /admin/stats/retention?seriesId
// ---------------------------------------------------------------------------

export interface StatsRetentionPoint {
  episodeNumber: number
  viewers: number
  retentionPercent: number
}

export interface StatsRetention {
  seriesId: string | null
  cohortSize: number
  points: StatsRetentionPoint[]
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
// Monetization (B-06) — contract v1.4
// ---------------------------------------------------------------------------

/** Currencies of the shop (contract v1.4 `Price`). XOF has no minor unit; the others have 2. */
export const CURRENCIES = ['XOF', 'NGN', 'GHS', 'EUR', 'USD'] as const
export type Currency = (typeof CURRENCIES)[number]

/** Amount in the minor unit of the currency (cents; FCFA without decimals). */
export interface Price {
  currency: Currency
  amountMinor: number
}

/** GET / PUT /admin/monetization/settings */
export interface MonetizationSettings {
  defaultFreeEpisodes: number
  defaultCoinCost: number
  seriesUnlockDiscountPercent: number
  adDailyCap: number
  autoUnlockDefault: boolean
  bonusValidityDays: number
}

/** Pack as the app receives it in `GET /shop` (price in the country's currency). */
export interface CoinPack {
  id: string
  /** Product id of the Play Console; immutable after creation. */
  sku: string
  coins: number
  bonusCoins: number
  price: Price
  badge?: string | null
  position: number
}

/** `CoinPackAdmin = CoinPack + { prices, isActive, createdAt }` of GET /admin/monetization/packs. */
export interface CoinPackAdmin extends CoinPack {
  prices: Price[]
  isActive: boolean
  createdAt: string
}

/** POST /admin/monetization/packs (every field) and PATCH /{id} (partial, never `sku`). */
export interface CoinPackInput {
  sku?: string
  coins?: number
  bonusCoins?: number
  badge?: string | null
  isActive?: boolean
  prices?: Price[]
}

export const VIP_PERIODS = ['WEEK', 'MONTH', 'YEAR'] as const
export type VipPeriod = (typeof VIP_PERIODS)[number]

export interface VipPlan {
  id: string
  sku: string
  period: VipPeriod
  price: Price
  trialDays: number
  badge?: string | null
}

/** `VipPlanAdmin = VipPlan + { prices, isActive }` of GET /admin/monetization/vip-plans. */
export interface VipPlanAdmin extends VipPlan {
  prices: Price[]
  isActive: boolean
  position?: number
  createdAt?: string
}

export interface VipPlanInput {
  sku?: string
  period?: VipPeriod
  trialDays?: number
  badge?: string | null
  isActive?: boolean
  prices?: Price[]
}

/** PUT /admin/monetization/packs/order */
export interface MonetizationOrderInput {
  ids: string[]
}

/** Play Console product ids: lowercase letters, digits, underscores and dots (2 to 80 chars). */
export const SKU_RE = /^[a-z0-9][a-z0-9_.]{1,79}$/

// ---------------------------------------------------------------------------
// Rewards (B-08) — contract v1.4
// ---------------------------------------------------------------------------

export const CHECKIN_DAYS = 7

/** GET / PUT /admin/rewards/checkin: coins granted on day 1..7 of a streak (M-40). */
export interface CheckinScale {
  days: number[]
  /** A missed day restarts the streak at day 1. */
  resetOnMiss: boolean
}

// ---------------------------------------------------------------------------
// Wallet, ledger and end users (B-09) — contract v1.4
// ---------------------------------------------------------------------------

export type CoinBucket = 'PURCHASED' | 'BONUS'
export const COIN_BUCKETS: readonly CoinBucket[] = ['PURCHASED', 'BONUS']

export type LedgerEntryType =
  'PURCHASE' | 'BONUS' | 'UNLOCK' | 'ADJUSTMENT' | 'EXPIRY' | 'REFUND' | 'MERGE'
export const LEDGER_ENTRY_TYPES: readonly LedgerEntryType[] = [
  'PURCHASE',
  'BONUS',
  'UNLOCK',
  'ADJUSTMENT',
  'EXPIRY',
  'REFUND',
  'MERGE',
]

export interface Wallet {
  purchased: number
  bonus: number
  total: number
  autoUnlock: boolean
  bonusExpiring: { amount: number; expiresAt: string }[]
}

export interface LedgerEntry {
  id: string
  /** Signed amount (+ credit, - debit). */
  amount: number
  bucket: CoinBucket
  type: LedgerEntryType
  reference: string | null
  description: string | null
  expiresAt: string | null
  createdAt: string
}

export type AppUserType = 'GUEST' | 'REGISTERED'
export type AppUserStatus = 'ACTIVE' | 'BLOCKED' | 'DELETION_PENDING' | 'MERGED' | 'DELETED'
export type AppAuthProvider = 'google' | 'phone' | 'email'

/** `UserDto` of the public contract (end user of the app), as returned to the back-office. */
export interface AppUser {
  id: string
  type: AppUserType
  status: AppUserStatus
  displayName: string | null
  email: string | null
  phone: string | null
  country: string | null
  language: string
  vipStatus: 'none' | 'active' | 'expired'
  vipExpiresAt: string | null
  providers: AppAuthProvider[]
  autoUnlock: boolean
  deletionScheduledAt?: string | null
  createdAt: string
  lastSeenAt?: string | null
}

/** Item of GET /admin/users?q (search by id, e-mail, phone or name). */
export interface AdminUserSummary {
  id: string
  type: AppUserType
  status: AppUserStatus
  displayName: string | null
  email: string | null
  phone: string | null
  country: string | null
  language?: string
  vipStatus?: 'none' | 'active' | 'expired'
  /** Wallet projection as the backend sends it (sprint 6). */
  balance?: { purchased: number; bonus: number; total: number }
  /** Flat total, accepted as a fallback. */
  coins?: number
  lastSeenAt: string | null
  createdAt: string
}

export interface AdminUsersQuery {
  q?: string
  page?: number
  pageSize?: number
}

export type SubscriptionState = 'none' | 'active' | 'cancelled' | 'expired' | 'grace'

/** `GET /me/subscription` shape, embedded in the admin user detail. */
export interface UserSubscription {
  status: SubscriptionState
  plan: VipPeriod | string | null
  startedAt: string | null
  expiresAt: string | null
  autoRenew: boolean
  store: 'google' | string | null
}

export type UnlockMethod = 'coins' | 'ad' | 'vip' | 'free' | 'auto'

export interface AdminUserUnlock {
  episodeId: string
  seriesId?: string
  seriesTitle: string
  episodeNumber: number
  /** The backend may send the enum in upper case; `normalizeUnlockMethod()` lowercases it. */
  method: UnlockMethod | Uppercase<UnlockMethod> | string
  at: string
}

export interface AdminUserPurchase {
  id: string
  productId: string
  /** `inapp` (coin pack) or `subs` (VIP). */
  type?: 'inapp' | 'subs' | string
  coins: number
  bonusCoins: number
  amountMinor: number | null
  currency: string | null
  status: string
  createdAt: string
}

/** GET /admin/users/{id} */
export interface AdminUserDetail {
  user: AppUser
  wallet: Wallet
  subscription: UserSubscription | null
  unlocks: AdminUserUnlock[]
  purchases: AdminUserPurchase[]
  recentLedger: LedgerEntry[]
  /** Number of push devices / sessions. */
  devices: number
  lastSeenAt: string | null
}

/** POST /admin/users/{id}/coins — one ADJUSTMENT ledger line, audited with the reason. */
export interface CoinAdjustmentInput {
  amount: number
  bucket: CoinBucket
  reason: string
}

/** POST /admin/users/{id}/block and /unblock */
export interface UserBlockInput {
  reason: string
}

// ---------------------------------------------------------------------------
// Reward tasks (B-08, M-41) — contract v1.5
// ---------------------------------------------------------------------------

/** Fixed task keys of the MVP (contract v1.5). The backend owns the progress logic. */
export const REWARD_TASK_KEYS = [
  'watch_3_episodes',
  'watch_10_episodes',
  'enable_notifications',
  'share_series',
  'complete_profile',
  'add_favorite',
] as const
export type RewardTaskKey = (typeof REWARD_TASK_KEYS)[number]

/** Recurrence of a task as the backend reports it (`daily` = reset every day…). */
export type RewardTaskPeriod = 'DAILY' | 'WEEKLY' | 'ONCE'

/** Item of GET /admin/rewards/tasks. */
export interface RewardTaskAdmin {
  key: RewardTaskKey | string
  /** Title shown in the app (French), informative in the back-office. */
  title: string
  description: string | null
  coins: number
  /** Goal of the progress counter (1 for one-shot tasks). */
  target: number
  isActive: boolean
  period?: RewardTaskPeriod
  updatedAt?: string
}

/** PATCH /admin/rewards/tasks/{key} */
export interface RewardTaskInput {
  coins?: number
  target?: number
  isActive?: boolean
}

// ---------------------------------------------------------------------------
// Offers and promo codes (B-07, M-24) — contract v1.5
// ---------------------------------------------------------------------------

/** GET/PUT /admin/offers/welcome : bonus % on the first purchase, `hours` after sign-up. */
export interface WelcomeOffer {
  isActive: boolean
  /** Pack the bonus applies to; `null` = every pack. */
  packSku: string | null
  bonusPercent: number
  hours: number
}

/** Item of GET /admin/offers/limited. */
export interface LimitedOffer {
  id: string
  title: string
  packSku: string
  bonusPercent: number
  /** ISO UTC; `null` = starts now. */
  startsAt: string | null
  endsAt: string
  isActive: boolean
  createdAt: string
  updatedAt?: string
}

export type LimitedOfferInput = Partial<Omit<LimitedOffer, 'id' | 'createdAt' | 'updatedAt'>>

/** Item of GET /admin/promo-codes. */
export interface PromoCode {
  id: string
  code: string
  coins: number
  /** Total redemptions allowed; `null` = unlimited. */
  maxUses: number | null
  perUserUses: number
  startsAt: string | null
  endsAt: string | null
  isActive: boolean
  /** Redemptions so far (sent by the backend). */
  usesCount: number
  createdAt: string
  updatedAt?: string
}

export type PromoCodeInput = Partial<
  Omit<PromoCode, 'id' | 'usesCount' | 'createdAt' | 'updatedAt'>
>

/** Item of GET /admin/promo-codes/{id}/redemptions. */
export interface PromoRedemption {
  id: string
  userId: string
  /** Display name, e-mail or phone when the backend sends it. */
  userLabel?: string | null
  coins: number
  redeemedAt: string
}

/** Code format accepted by the back-office: upper-case letters and digits, 4 to 32 chars. */
export const PROMO_CODE_RE = /^[A-Z0-9][A-Z0-9_-]{3,31}$/

/** Public GET /offers (what the app and the recharge site show). */
export interface PublicOffers {
  welcome: { packSku: string | null; bonusPercent: number; expiresAt: string } | null
  limited: { id: string; title: string; packSku: string; bonusPercent: number; endsAt: string }[]
}

// ---------------------------------------------------------------------------
// Mobile money top-ups (M-34, S09) — contract v1.5
// ---------------------------------------------------------------------------

export type TopupOrderStatus = 'PENDING' | 'PAID' | 'FAILED' | 'EXPIRED'
export const TOPUP_ORDER_STATUSES: readonly TopupOrderStatus[] = [
  'PENDING',
  'PAID',
  'FAILED',
  'EXPIRED',
]

/** POST /topup/orders */
export interface TopupOrderCreateInput {
  packSku: string
  country: string
  phone?: string
  idempotencyKey: string
}

/** 201 of POST /topup/orders. */
export interface TopupOrderCreated {
  orderId: string
  amount: Price
  paymentUrl: string
  expiresAt: string
}

/** GET /topup/orders/{id} and items of GET /topup/orders?page. */
export interface TopupOrder {
  /** The backend may name the identifier `id` or `orderId`: both are accepted. */
  id?: string
  orderId?: string
  status: TopupOrderStatus
  /**
   * Base (purchased) coins of the pack. The real backend reports the bonus separately in
   * `bonusCoins` rather than folding it into `coins`, despite the contract text ("coins
   * credited") suggesting a single total: use `orderTotalCoins()` to get purchased + bonus.
   */
  coins: number
  bonusCoins?: number
  creditedAt: string | null
  packSku?: string
  amount?: Price
  paymentUrl?: string | null
  expiresAt?: string
  createdAt?: string
}

/** GET /admin/topup/reconciliation?date (MONETIZATION, ADMIN). */
export interface TopupReconciliationMismatch {
  orderId: string
  userId?: string | null
  packSku?: string | null
  status?: TopupOrderStatus | string
  amount?: Price | null
  /** What the provider reports vs what the ledger holds. */
  providerStatus?: string | null
  coinsExpected?: number | null
  coinsCredited?: number | null
  reason: string
  createdAt?: string
}

export interface TopupReconciliation {
  /** `YYYY-MM-DD` in Lomé time. */
  date: string
  orders: number
  paid: number
  credited: number
  /** Optional totals when the backend sends them. */
  failed?: number
  expired?: number
  pending?: number
  /** Amounts paid, grouped per currency (the real API reports an array, not a single total). */
  amounts?: Price[]
  mismatches: TopupReconciliationMismatch[]
  generatedAt?: string
}

// ---------------------------------------------------------------------------
// Public API reused by the recharge site (public contract v1.2, openapi.v1.json)
// ---------------------------------------------------------------------------

/** `AuthSessionDto`: the session of an end user (OTP, e-mail, Google). */
export interface PublicAuthSession {
  accessToken: string
  refreshToken: string
  /** Lifetime of the access JWT in seconds. */
  expiresIn: number
  user: AppUser
  linked: boolean
}

/** POST /auth/otp/request → `OtpRequestResponseDto`. */
export interface OtpRequestResponse {
  requestId: string
  expiresIn: number
  resendAfter: number
}

/** GET /shop (with `X-Country`). */
export interface PublicShop {
  currency: Currency
  coinPacks: CoinPack[]
  vipPlans: VipPlan[]
  welcomeOffer: unknown | null
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
