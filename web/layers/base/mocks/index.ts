import { ApiError } from '../utils/api-error'
import type {
  AdminAccount,
  AdminAccountCreateInput,
  AdminUserDetail,
  AdminUserPurchase,
  AdminUserSummary,
  AdminUserUnlock,
  AppUser,
  CheckinScale,
  CoinAdjustmentInput,
  CoinPackAdmin,
  CoinPackInput,
  LedgerEntry,
  MonetizationOrderInput,
  MonetizationSettings,
  Price,
  UserBlockInput,
  VipPlanAdmin,
  VipPlanInput,
  Wallet,
  AdminAccountResetPasswordInput,
  AdminAccountUpdateInput,
  AdminEpisode,
  AdminEpisodeCreateInput,
  AdminEpisodeOrderInput,
  AdminEpisodeUpdateInput,
  AdminRole,
  AdminSeries,
  AdminSeriesInput,
  AdminSeriesUpdateInput,
  AdminUser,
  AuditLog,
  Campaign,
  CampaignInput,
  CampaignSegment,
  EpisodeUploadUrlRequest,
  EpisodeUploadUrlResponse,
  FaqEntry,
  FaqEntryInput,
  FaqLocalized,
  HomeBanner,
  HomeBannerInput,
  HomeOrderInput,
  HomeRow,
  HomeRowInput,
  HomeRowTitles,
  LoginRequest,
  LoginResponse,
  Paginated,
  PresignRequest,
  PresignResponse,
  PublicFaqResponse,
  PublicHomeResponse,
  PublicSeriesSummary,
  ScheduleApiItem,
  ScheduleApiResponse,
  SeriesStatus,
  StatsOverview,
  StatsPeriod,
  Subtitle,
  SupportTicket,
  SupportTicketStatus,
  TotpVerifyRequest,
  TotpVerifyResponse,
  TrustedDevice,
} from '../types/api'
import {
  ADMIN_ROLES,
  COIN_BUCKETS,
  CAMPAIGN_SEGMENT_TYPES,
  FAQ_LANGUAGES,
  TRUSTED_DEVICE_MAX_AGE_SECONDS,
  HOME_ROW_KEY_RE,
  HOME_ROW_TYPES,
  HOME_TITLE_LANGUAGES,
  MONETIZATION_FIELDS,
  SERIES_GENRES,
  SERIES_STATUSES,
  SUBTITLE_MAX_FILE_BYTES,
} from '../types/api'
import { isIsoCountryCode, normalizeCountryCode } from '../utils/countries'
import { passwordProblems } from '../utils/accounts'
import {
  isIsoLanguageCode,
  isVtt,
  languageName,
  normalizeLanguageCode,
  srtToVtt,
  validateSubtitleFile,
} from '../utils/subtitles'
import authFixture from './auth.json'
import seriesFixture from './series.json'
import episodesFixture from './episodes.json'
import subtitlesFixture from './subtitles.json'
import homeFixture from './home.json'
import auditLogsFixture from './audit-logs.json'
import statsFixture from './stats.json'
import campaignsFixture from './campaigns.json'
import faqFixture from './faq.json'
import ticketsFixture from './tickets.json'
import monetizationFixture from './monetization.json'
import usersFixture from './users.json'
import {
  isCurrency,
  isValidSku,
  isVipPeriod,
  samePrices,
  sortVipPlans,
  validateSettings,
} from '../utils/monetization'
import { normalizeCheckinDays, validateCheckinScale, hasCheckinErrors } from '../utils/rewards'
import { ADJUSTMENT_REASON_MIN, sortLedger } from '../utils/users'
import { isStatsPeriod } from '../utils/stats'
import {
  bodyRemaining,
  canCancelCampaign,
  canDeleteCampaign,
  canEditCampaign,
  canSendCampaign,
  isValidDeepLink,
  statusAfterSend,
} from '../utils/campaigns'
import {
  faqPreview,
  isTicketStatus,
  sortFaqEntries,
  sortTickets,
  ticketTransition,
} from '../utils/help-center'
import { mockAssetUrlFor, mockUploadUrlFor, registerMockAsset } from './assets'

/**
 * In-memory implementation of the admin API used when `runtimeConfig.public.apiMock` is true.
 * It follows docs/api/admin-contract-v1.md: same routes, same payloads, same error statuses.
 * State is kept in memory (reset on reload, or with `resetMockState()` in tests).
 *
 * Demo accounts (password `Admin1234!`, TOTP `123456`):
 *   admin@drama.local (ADMIN) · editor@drama.local (EDITOR) · money@drama.local (MONETIZATION,
 *   first login → TOTP enrolment) · support@drama.local (SUPPORT, read-only on the catalogue).
 *
 * Upload simulation: `upload-url` / `presign` return `mock://upload/...` URLs handled by
 * `mockUploadTransport`; `POST /uploaded` moves the episode UPLOADED → PROCESSING → READY after
 * `mockTiming` delays (READY episodes point to the sample HLS of infra/media-samples in MinIO).
 * A file whose name contains `fail` ends FAILED (to demo the retranscode action).
 *
 * Addendum v1.1: subtitles (multipart upload kept as an object URL so the preview `<track>`
 * works), home banners/rows with a `/admin/home/preview` computed like the public `/home`,
 * internal accounts (linked to the login flow: deactivation, TOTP reset, created accounts can
 * sign in) and an audit log fed by every mutation of this mock.
 *
 * Contract v1.3 (sprint 5): trusted devices (login with a valid `deviceToken` skips TOTP),
 * push campaigns (estimate from a fake audience table, SENDING → SENT after
 * `mockTiming.campaignSendMs`), FAQ with the public `/help/faq` fallback and support tickets.
 *
 * Contract v1.4 (sprint 6): monetization settings, coin packs and VIP plans (B-06), the
 * check-in scale (B-08) and end users with a wallet projected from an in-memory ledger (B-09):
 * a manual adjustment appends an ADJUSTMENT line, blocking changes the status.
 */

export type MockMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface MockRequest {
  method: MockMethod
  path: string
  body?: unknown
  token?: string | null
}

interface MockContext extends MockRequest {
  params: Record<string, string>
  query: URLSearchParams
  user: AdminUser | null
}

type Handler = (context: MockContext) => unknown

interface Route {
  method: MockMethod
  pattern: RegExp
  keys: string[]
  handler: Handler
}

/** Delays of the simulation, exported so tests can shorten them. */
export const mockTiming = {
  latencyMs: 150,
  uploadedToProcessingMs: 1500,
  processingToReadyMs: 4000,
  campaignSendMs: 2500,
}

const SAMPLE_COUNT = 3
const SAMPLE_BASE = 'hls/samples'
const SAMPLE_THUMBNAIL_BASE = 'http://localhost:9000/drama-media/hls/samples'

const authRoutes = new Set(['/admin/auth/login', '/admin/auth/totp/verify'])

interface MockAccount {
  token: string
  totpEnrolled: boolean
  isActive: boolean
  lastLoginAt: string | null
  createdAt: string
  /** Password of accounts created in the session; fixture accounts share the fixture password. */
  password?: string
  user: AdminUser
  /** Trusted device that opened the current session (mock only, drives `current`). */
  currentDeviceId?: string | null
}

/** Trusted device of an account (the raw token is kept here; the backend stores a hash). */
interface MockDevice extends Omit<TrustedDevice, 'current'> {
  accountId: string
  token: string
}

const fixtureAccounts = authFixture.users as MockAccount[]

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface MockState {
  series: AdminSeries[]
  episodes: AdminEpisode[]
  subtitles: Subtitle[]
  banners: HomeBanner[]
  rows: HomeRow[]
  accounts: MockAccount[]
  auditLogs: AuditLog[]
  challenges: Map<string, MockAccount>
  devices: MockDevice[]
  campaigns: Campaign[]
  faq: FaqEntry[]
  tickets: SupportTicket[]
  monetizationSettings: MonetizationSettings
  packs: CoinPackAdmin[]
  vipPlans: VipPlanAdmin[]
  checkin: CheckinScale
  users: MockUser[]
}

/** End user of the app with the raw material of the detail (ledger → wallet projection). */
interface MockUser {
  user: AppUser
  ledger: LedgerEntry[]
  unlocks: AdminUserUnlock[]
  purchases: AdminUserPurchase[]
  subscription: AdminUserDetail['subscription']
  devices: number
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/**
 * Fixtures are static JSON, but the planning demo needs dates in the future: the episodes 2 to 5
 * of « Mariage sous contrat » are released one per day from tomorrow at 18:00 (Lomé), and the
 * draft « La Revanche de l'héritière » is scheduled next week.
 */
function seedSchedule(series: AdminSeries[], episodes: AdminEpisode[]): void {
  const base = new Date()
  base.setUTCHours(18, 0, 0, 0)
  const inDays = (days: number, hour = 18): string => {
    const date = new Date(base.getTime() + days * 86_400_000)
    date.setUTCHours(hour, 0, 0, 0)
    return date.toISOString()
  }
  const daily = ['12', '13', '14', '15']
  daily.forEach((suffix, index) => {
    const episode = episodes.find((item) => item.id === `ep_01HZX0E00000000000000000${suffix}`)
    if (episode) episode.publishedAt = inDays(index + 1)
  })
  const draft = series.find((item) => item.id === 'ser_01HZX0A1B2C3D4E5F6G7H8J9K2')
  if (draft) draft.publishedAt = inDays(7, 10)
}

function initialState(): MockState {
  const subtitles = clone(subtitlesFixture) as Subtitle[]
  seedSubtitleAssets(subtitles)
  const series = clone(seriesFixture) as AdminSeries[]
  const episodes = clone(episodesFixture) as AdminEpisode[]
  seedSchedule(series, episodes)
  return {
    series,
    episodes,
    subtitles,
    banners: clone(homeFixture.banners) as HomeBanner[],
    rows: clone(homeFixture.rows) as HomeRow[],
    accounts: clone(fixtureAccounts),
    auditLogs: clone(auditLogsFixture) as AuditLog[],
    challenges: new Map(),
    devices: [],
    campaigns: seedCampaigns(clone(campaignsFixture) as Campaign[]),
    faq: clone(faqFixture) as FaqEntry[],
    tickets: clone(ticketsFixture) as SupportTicket[],
    monetizationSettings: clone(monetizationFixture.settings) as MonetizationSettings,
    packs: clone(monetizationFixture.packs) as CoinPackAdmin[],
    vipPlans: clone(monetizationFixture.vipPlans) as VipPlanAdmin[],
    checkin: clone(monetizationFixture.checkin) as CheckinScale,
    users: seedUsers(clone(usersFixture.users) as unknown as MockUserFixture[]),
  }
}

interface MockUserFixture extends Omit<MockUser, 'ledger'> {
  ledger: LedgerEntry[]
  bonusExpiring?: { amount: number; expiresAt: string }[]
}

/** `__FUTURE_<n>D__` placeholders of the users fixture become dates n days ahead. */
function futurePlaceholder(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const match = /^__FUTURE_(\d+)D__$/.exec(value)
  if (!match) return value
  return new Date(Date.now() + Number(match[1]) * 86_400_000).toISOString()
}

function resolveFutureDates<T>(value: T): T {
  if (Array.isArray(value)) return value.map(resolveFutureDates) as T
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        resolveFutureDates(item),
      ]),
    ) as T
  }
  return futurePlaceholder(value) as T
}

function seedUsers(fixtures: MockUserFixture[]): MockUser[] {
  return fixtures.map((fixture) => {
    const { bonusExpiring: _ignored, ...rest } = resolveFutureDates(fixture)
    return rest
  })
}

/** The scheduled fixture campaign is always in the future (placeholder replaced at load). */
function seedCampaigns(campaigns: Campaign[]): Campaign[] {
  for (const campaign of campaigns) {
    if (campaign.scheduledAt === '__FUTURE_2D_10H__') {
      const date = new Date(Date.now() + 2 * 86_400_000)
      date.setUTCHours(10, 0, 0, 0)
      campaign.scheduledAt = date.toISOString()
    }
  }
  return campaigns
}

/** Sample WebVTT cues (30 s) so the fixture subtitles really display in the preview. */
export function sampleVtt(language: string): string {
  const lines: Record<string, string[]> = {
    fr: ['Je savais que tu reviendrais.', 'Ils ont menti. Tous.', 'Alors choisis ton camp.'],
    en: ['I knew you would come back.', 'They lied. All of them.', 'So pick a side.'],
    es: ['Sabía que volverías.', 'Mintieron. Todos.', 'Entonces elige tu bando.'],
    pt: ['Eu sabia que você voltaria.', 'Eles mentiram. Todos.', 'Então escolha um lado.'],
  }
  const cues = lines[language] ?? lines.en ?? []
  const body = cues
    .map((text, index) => {
      const start = index * 8 + 1
      return `${index + 1}\n00:00:${String(start).padStart(2, '0')}.000 --> 00:00:${String(start + 5).padStart(2, '0')}.000\n${text}`
    })
    .join('\n\n')
  return `WEBVTT\n\n${body}\n`
}

function subtitleKey(episodeId: string, language: string): string {
  return `subtitles/${episodeId}/${language}.vtt`
}

function seedSubtitleAssets(subtitles: readonly Subtitle[]): void {
  for (const subtitle of subtitles) {
    registerMockAsset(
      mockUploadUrlFor(subtitleKey(subtitle.episodeId, subtitle.language)),
      new Blob([sampleVtt(subtitle.language)], { type: 'text/vtt' }),
    )
  }
}

let state = initialState()
const timers = new Set<ReturnType<typeof setTimeout>>()

/** Restore the fixtures and cancel pending transcode simulations (tests). */
export function resetMockState(): void {
  timers.forEach((timer) => clearTimeout(timer))
  timers.clear()
  state = initialState()
}

function later(ms: number, fn: () => void): void {
  const timer = setTimeout(() => {
    timers.delete(timer)
    fn()
  }, ms)
  timers.add(timer)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let idCounter = 0
function newId(prefix: string): string {
  idCounter += 1
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 20).toUpperCase()
      : String(Date.now())
  return `${prefix}_${random}${String(idCounter).padStart(4, '0')}`
}

function now(): string {
  return new Date().toISOString()
}

function slugify(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function fail(status: number, code: string, message: string, path: string): never {
  throw ApiError.fromBody(status, code, message, path)
}

function requireAuth(context: MockContext): AdminUser {
  if (!context.user) fail(401, 'UNAUTHORIZED', 'Unauthorized', context.path)
  return context.user
}

function requireRole(context: MockContext, roles: AdminRole[]): AdminUser {
  const user = requireAuth(context)
  if (!roles.includes(user.role)) {
    fail(403, 'FORBIDDEN', `Role ${user.role} cannot perform this action`, context.path)
  }
  return user
}

/** Append an audit line like the backend's AuditService does for every mutation. */
function audit(
  context: MockContext,
  action: string,
  targetType: string,
  targetId: string | null,
  oldValue: unknown = null,
  newValue: unknown = null,
): void {
  state.auditLogs.unshift({
    id: newId('aud'),
    actorId: context.user?.id ?? null,
    actorEmail: context.user?.email ?? null,
    action,
    targetType,
    targetId,
    oldValue: oldValue === undefined ? null : clone(oldValue),
    newValue: newValue === undefined ? null : clone(newValue),
    ip: '127.0.0.1',
    createdAt: now(),
  })
}

function findSeries(context: MockContext, id: string): AdminSeries {
  const series = state.series.find((item) => item.id === id)
  if (!series) fail(404, 'SERIES_NOT_FOUND', `Series ${id} not found`, context.path)
  return series
}

function findEpisode(context: MockContext, id: string): AdminEpisode {
  const episode = state.episodes.find((item) => item.id === id)
  if (!episode) fail(404, 'EPISODE_NOT_FOUND', `Episode ${id} not found`, context.path)
  return episode
}

function seriesEpisodes(seriesId: string): AdminEpisode[] {
  return state.episodes
    .filter((episode) => episode.seriesId === seriesId)
    .sort((a, b) => a.number - b.number)
}

function syncEpisodeCount(seriesId: string): void {
  const series = state.series.find((item) => item.id === seriesId)
  if (series) {
    series.episodeCount = seriesEpisodes(seriesId).length
    series.updatedAt = now()
  }
}

function touch(episode: AdminEpisode, patch: Partial<AdminEpisode>): AdminEpisode {
  Object.assign(episode, patch, { updatedAt: now() })
  return episode
}

const EDITABLE_FIELDS: (keyof AdminSeriesInput)[] = [
  'title',
  'synopsis',
  'genres',
  'tags',
  'language',
  'ageRating',
  'posterVerticalUrl',
  'posterHorizontalUrl',
  'freeEpisodeCount',
  'coinCostPerEpisode',
  'territories',
]

function applySeriesInput(
  context: MockContext,
  target: AdminSeries,
  input: Partial<AdminSeriesInput>,
): void {
  const user = requireRole(context, ['EDITOR', 'MONETIZATION', 'ADMIN'])
  const canMonetize = user.role === 'MONETIZATION' || user.role === 'ADMIN'
  for (const field of EDITABLE_FIELDS) {
    if (!(field in input)) continue
    const isMonetizationField = (MONETIZATION_FIELDS as readonly string[]).includes(field)
    if (isMonetizationField && !canMonetize) {
      fail(403, 'FORBIDDEN', `Field ${field} requires the MONETIZATION or ADMIN role`, context.path)
    }
    if (!isMonetizationField && user.role === 'MONETIZATION') {
      fail(403, 'FORBIDDEN', `Field ${field} requires the EDITOR or ADMIN role`, context.path)
    }
    ;(target as unknown as Record<string, unknown>)[field] = clone(input[field])
  }
  if (typeof target.title !== 'string' || target.title.trim().length === 0) {
    fail(400, 'VALIDATION_ERROR', 'title is required', context.path)
  }
}

/** `publishedAt` of a PATCH: `null` clears, otherwise a valid ISO date-time (stored as UTC). */
function readPublishedAt(context: MockContext, value: unknown): string | null {
  if (value === null) return null
  if (typeof value !== 'string' || Number.isNaN(new Date(value).getTime())) {
    fail(400, 'VALIDATION_ERROR', 'publishedAt must be an ISO date-time or null', context.path)
  }
  return new Date(value).toISOString()
}

/** Simulated transcode pipeline: UPLOADED → PROCESSING → READY | FAILED. */
function scheduleTranscode(episodeId: string): void {
  later(mockTiming.uploadedToProcessingMs, () => {
    const episode = state.episodes.find((item) => item.id === episodeId)
    if (!episode || episode.transcodeStatus !== 'UPLOADED') return
    touch(episode, { transcodeStatus: 'PROCESSING' })
    later(mockTiming.processingToReadyMs, () => {
      const current = state.episodes.find((item) => item.id === episodeId)
      if (!current || current.transcodeStatus !== 'PROCESSING') return
      if ((current.sourceKey ?? '').toLowerCase().includes('fail')) {
        touch(current, {
          transcodeStatus: 'FAILED',
          transcodeError: 'ffmpeg exited with code 1: Invalid data found when processing input',
        })
        return
      }
      const sample = (current.number % SAMPLE_COUNT) + 1
      touch(current, {
        transcodeStatus: 'READY',
        transcodeError: null,
        durationSeconds: 30,
        hlsKey: `${SAMPLE_BASE}/ep${sample}/master.m3u8`,
        previewKey: `${SAMPLE_BASE}/ep${sample}/preview/index.m3u8`,
        thumbnailUrl: `${SAMPLE_THUMBNAIL_BASE}/ep${sample}/thumbnail.jpg`,
      })
    })
  })
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const routes: Route[] = []

function route(method: MockMethod, path: string, handler: Handler): void {
  const keys: string[] = []
  const source = path.replace(/:(\w+)/g, (_match, key: string) => {
    keys.push(key)
    return '([^/]+)'
  })
  routes.push({ method, pattern: new RegExp(`^${source}$`), keys, handler })
}

// --- auth -------------------------------------------------------------------

route('POST', '/admin/auth/login', ({ body, path }): LoginResponse => {
  const { email, password, deviceToken } = (body ?? {}) as Partial<LoginRequest>
  const account = state.accounts.find((item) => item.user.email === email?.trim().toLowerCase())
  const expected = account?.password ?? authFixture.credentials.password
  if (!account || password !== expected) {
    fail(401, 'INVALID_CREDENTIALS', 'Invalid credentials', path)
  }
  if (!account.isActive) {
    fail(401, 'ACCOUNT_DISABLED', 'This account is deactivated', path)
  }
  // Trusted device (contract v1.3): a valid token for this account skips the TOTP step.
  // An invalid, expired or foreign token is silently ignored.
  if (deviceToken && account.totpEnrolled) {
    const device = state.devices.find(
      (item) =>
        item.token === deviceToken &&
        item.accountId === account.user.id &&
        new Date(item.expiresAt).getTime() > Date.now(),
    )
    if (device) {
      device.lastUsedAt = now()
      account.currentDeviceId = device.id
      account.lastLoginAt = now()
      recordLogin(account, 'trusted_device')
      return {
        status: 'ok',
        accessToken: account.token,
        expiresIn: 8 * 3600,
        user: clone(account.user),
      }
    }
  }
  const challengeToken = `${authFixture.challengeToken}:${account.user.role.toLowerCase()}`
  state.challenges.set(challengeToken, account)
  if (!account.totpEnrolled) {
    return {
      status: 'totp_setup_required',
      challengeToken,
      secret: authFixture.secret,
      otpauthUri: authFixture.otpauthUri.replace(
        'admin%40drama.local',
        encodeURIComponent(account.user.email),
      ),
    }
  }
  return { status: 'totp_required', challengeToken }
})

function recordLogin(account: MockAccount, method: 'totp' | 'trusted_device'): void {
  state.auditLogs.unshift({
    id: newId('aud'),
    actorId: account.user.id,
    actorEmail: account.user.email,
    action: 'admin.login',
    targetType: 'admin_account',
    targetId: account.user.id,
    oldValue: null,
    newValue: { method },
    ip: '127.0.0.1',
    createdAt: now(),
  })
}

/** `Chrome · Linux`-style label from the browser's user agent (the backend does the same). */
function deviceLabel(): string {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\//.test(ua)
      ? 'Firefox'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'Navigateur'
  const os = /Android/.test(ua)
    ? 'Android'
    : /iPhone|iPad/.test(ua)
      ? 'iOS'
      : /Windows/.test(ua)
        ? 'Windows'
        : /Mac OS/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : 'Inconnu'
  return `${browser} · ${os}`
}

function randomToken(): string {
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    const bytes = crypto.getRandomValues(new Uint8Array(32))
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  }
  return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`
}

function toTrustedDevice(device: MockDevice, account: MockAccount): TrustedDevice {
  return {
    id: device.id,
    label: device.label,
    createdAt: device.createdAt,
    lastUsedAt: device.lastUsedAt,
    expiresAt: device.expiresAt,
    current: account.currentDeviceId === device.id,
  }
}

function revokeDevicesOf(accountId: string): number {
  const before = state.devices.length
  state.devices = state.devices.filter((device) => device.accountId !== accountId)
  const account = state.accounts.find((item) => item.user.id === accountId)
  if (account) account.currentDeviceId = null
  return before - state.devices.length
}

route('POST', '/admin/auth/totp/verify', ({ body, path }): TotpVerifyResponse => {
  const { challengeToken, code, rememberDevice } = (body ?? {}) as Partial<TotpVerifyRequest>
  const account = challengeToken ? state.challenges.get(challengeToken) : undefined
  if (!account || code !== authFixture.credentials.totpCode) {
    fail(401, 'INVALID_TOTP_CODE', 'Invalid TOTP code', path)
  }
  state.challenges.delete(challengeToken as string)
  account.totpEnrolled = true
  account.lastLoginAt = now()
  account.currentDeviceId = null
  recordLogin(account, 'totp')
  const response: TotpVerifyResponse = {
    accessToken: account.token,
    expiresIn: 8 * 3600,
    user: clone(account.user),
  }
  if (rememberDevice === true) {
    const device: MockDevice = {
      id: newId('dev'),
      accountId: account.user.id,
      token: randomToken(),
      label: deviceLabel(),
      createdAt: now(),
      lastUsedAt: now(),
      expiresAt: new Date(Date.now() + TRUSTED_DEVICE_MAX_AGE_SECONDS * 1000).toISOString(),
    }
    state.devices.push(device)
    account.currentDeviceId = device.id
    response.deviceToken = device.token
    response.deviceTokenExpiresAt = device.expiresAt
  }
  return response
})

route('GET', '/admin/auth/devices', (context): TrustedDevice[] => {
  const user = requireAuth(context)
  const account = state.accounts.find((item) => item.user.id === user.id) as MockAccount
  return state.devices
    .filter((device) => device.accountId === user.id)
    .map((device) => toTrustedDevice(device, account))
})

route('DELETE', '/admin/auth/devices/:id', (context) => {
  const user = requireAuth(context)
  const index = state.devices.findIndex(
    (device) => device.id === context.params.id && device.accountId === user.id,
  )
  if (index === -1) fail(404, 'DEVICE_NOT_FOUND', 'Trusted device not found', context.path)
  const [removed] = state.devices.splice(index, 1)
  const account = state.accounts.find((item) => item.user.id === user.id)
  if (account && account.currentDeviceId === removed?.id) account.currentDeviceId = null
  audit(context, 'admin_device.revoke', 'admin_account', user.id, { deviceId: removed?.id }, null)
  return null
})

route('POST', '/admin/auth/logout', (context) => {
  requireAuth(context)
  return null
})

route('GET', '/admin/auth/me', (context): AdminUser => requireAuth(context))

// --- series -----------------------------------------------------------------

route('GET', '/admin/series', (context): Paginated<AdminSeries> => {
  requireAuth(context)
  const page = Math.max(1, Number(context.query.get('page') ?? 1))
  const pageSize = Math.min(100, Math.max(1, Number(context.query.get('pageSize') ?? 20)))
  const status = context.query.get('status') as SeriesStatus | null
  const q = (context.query.get('q') ?? '').trim().toLowerCase()
  if (status && !SERIES_STATUSES.includes(status)) {
    fail(400, 'VALIDATION_ERROR', `Unknown status ${status}`, context.path)
  }
  const filtered = state.series
    .filter((series) => !status || series.status === status)
    .filter(
      (series) =>
        !q || series.title.toLowerCase().includes(q) || series.slug.toLowerCase().includes(q),
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const start = (page - 1) * pageSize
  return {
    items: clone(filtered.slice(start, start + pageSize)),
    total: filtered.length,
    page,
    pageSize,
  }
})

route('POST', '/admin/series', (context): AdminSeries => {
  const input = (context.body ?? {}) as Partial<AdminSeriesInput>
  const series: AdminSeries = {
    id: newId('ser'),
    slug: '',
    title: '',
    synopsis: '',
    genres: [],
    tags: [],
    language: 'fr',
    ageRating: 'ALL',
    posterVerticalUrl: null,
    posterHorizontalUrl: null,
    freeEpisodeCount: 0,
    coinCostPerEpisode: 0,
    status: 'DRAFT',
    territories: [],
    episodeCount: 0,
    publishedAt: null,
    createdAt: now(),
    updatedAt: now(),
  }
  applySeriesInput(context, series, input)
  series.slug = slugify(series.title) || series.id.toLowerCase()
  state.series.unshift(series)
  audit(context, 'series.create', 'series', series.id, null, input)
  return clone(series)
})

route('GET', '/admin/series/:id', (context): AdminSeries => {
  requireAuth(context)
  return clone(findSeries(context, context.params.id as string))
})

route('PATCH', '/admin/series/:id', (context): AdminSeries => {
  const series = findSeries(context, context.params.id as string)
  const before = clone(series)
  const { publishedAt, ...input } = (context.body ?? {}) as AdminSeriesUpdateInput
  applySeriesInput(context, series, input)
  if (publishedAt !== undefined) {
    // B-04: scheduling is a catalogue change (EDITOR / ADMIN).
    requireRole(context, ['EDITOR', 'ADMIN'])
    series.publishedAt = readPublishedAt(context, publishedAt)
  }
  series.updatedAt = now()
  const changedKeys = Object.keys(context.body ?? {}) as (keyof AdminSeries)[]
  audit(
    context,
    'series.update',
    'series',
    series.id,
    Object.fromEntries(changedKeys.map((key) => [key, before[key]])),
    Object.fromEntries(changedKeys.map((key) => [key, series[key]])),
  )
  return clone(series)
})

route('POST', '/admin/series/:id/publish', (context): AdminSeries => {
  requireRole(context, ['EDITOR', 'ADMIN'])
  const series = findSeries(context, context.params.id as string)
  const hasReady = seriesEpisodes(series.id).some((e) => e.transcodeStatus === 'READY')
  if (!hasReady) {
    fail(
      409,
      'SERIES_NO_READY_EPISODE',
      'A series needs at least one READY episode to be published',
      context.path,
    )
  }
  const previous = series.status
  series.status = 'PUBLISHED'
  series.publishedAt = series.publishedAt ?? now()
  series.updatedAt = now()
  audit(
    context,
    'series.publish',
    'series',
    series.id,
    { status: previous },
    { status: 'PUBLISHED' },
  )
  return clone(series)
})

route('POST', '/admin/series/:id/archive', (context): AdminSeries => {
  requireRole(context, ['EDITOR', 'ADMIN'])
  const series = findSeries(context, context.params.id as string)
  const previous = series.status
  series.status = 'ARCHIVED'
  series.updatedAt = now()
  audit(
    context,
    'series.archive',
    'series',
    series.id,
    { status: previous },
    { status: 'ARCHIVED' },
  )
  return clone(series)
})

// --- episodes ---------------------------------------------------------------

route('GET', '/admin/series/:id/episodes', (context): AdminEpisode[] => {
  requireAuth(context)
  const series = findSeries(context, context.params.id as string)
  return clone(seriesEpisodes(series.id))
})

route('POST', '/admin/series/:id/episodes', (context): AdminEpisode => {
  requireRole(context, ['EDITOR', 'ADMIN'])
  const series = findSeries(context, context.params.id as string)
  const input = (context.body ?? {}) as AdminEpisodeCreateInput
  const existing = seriesEpisodes(series.id)
  const number = input.number ?? (existing.at(-1)?.number ?? 0) + 1
  const episode: AdminEpisode = {
    id: newId('ep'),
    seriesId: series.id,
    number,
    title: input.title?.trim() || `Épisode ${number}`,
    durationSeconds: null,
    transcodeStatus: 'PENDING',
    sourceKey: null,
    hlsKey: null,
    thumbnailUrl: null,
    previewKey: null,
    publishedAt: null,
    transcodeError: null,
    createdAt: now(),
    updatedAt: now(),
  }
  state.episodes.push(episode)
  syncEpisodeCount(series.id)
  return clone(episode)
})

route('PATCH', '/admin/episodes/:id', (context): AdminEpisode => {
  requireRole(context, ['EDITOR', 'ADMIN'])
  const episode = findEpisode(context, context.params.id as string)
  const input = (context.body ?? {}) as AdminEpisodeUpdateInput
  if (input.title !== undefined) {
    if (!input.title.trim()) fail(400, 'VALIDATION_ERROR', 'title cannot be empty', context.path)
    episode.title = input.title.trim()
  }
  if (input.publishedAt !== undefined) {
    const before = episode.publishedAt
    episode.publishedAt = readPublishedAt(context, input.publishedAt)
    audit(
      context,
      'episode.update',
      'episode',
      episode.id,
      { publishedAt: before },
      { publishedAt: episode.publishedAt },
    )
  }
  return clone(touch(episode, {}))
})

route('DELETE', '/admin/episodes/:id', (context) => {
  requireRole(context, ['EDITOR', 'ADMIN'])
  const episode = findEpisode(context, context.params.id as string)
  state.episodes = state.episodes.filter((item) => item.id !== episode.id)
  state.subtitles = state.subtitles.filter((item) => item.episodeId !== episode.id)
  seriesEpisodes(episode.seriesId).forEach((item, index) => {
    item.number = index + 1
  })
  syncEpisodeCount(episode.seriesId)
  audit(
    context,
    'episode.delete',
    'episode',
    episode.id,
    { number: episode.number, title: episode.title },
    null,
  )
  return null
})

route('PUT', '/admin/series/:id/episodes/order', (context): AdminEpisode[] => {
  requireRole(context, ['EDITOR', 'ADMIN'])
  const series = findSeries(context, context.params.id as string)
  const { episodeIds } = (context.body ?? {}) as Partial<AdminEpisodeOrderInput>
  const current = seriesEpisodes(series.id)
  const ids = new Set(current.map((episode) => episode.id))
  if (
    !Array.isArray(episodeIds) ||
    episodeIds.length !== current.length ||
    !episodeIds.every((id) => ids.has(id))
  ) {
    fail(400, 'VALIDATION_ERROR', 'episodeIds must list every episode of the series', context.path)
  }
  episodeIds.forEach((id, index) => {
    const episode = current.find((item) => item.id === id)
    if (episode) touch(episode, { number: index + 1 })
  })
  syncEpisodeCount(series.id)
  return clone(seriesEpisodes(series.id))
})

route('POST', '/admin/episodes/:id/upload-url', (context): EpisodeUploadUrlResponse => {
  requireRole(context, ['EDITOR', 'ADMIN'])
  const episode = findEpisode(context, context.params.id as string)
  const input = (context.body ?? {}) as Partial<EpisodeUploadUrlRequest>
  if (!input.fileName || !input.contentType) {
    fail(400, 'VALIDATION_ERROR', 'fileName and contentType are required', context.path)
  }
  if (!['video/mp4', 'video/quicktime'].includes(input.contentType)) {
    fail(
      400,
      'UNSUPPORTED_MEDIA_TYPE',
      `Unsupported content type ${input.contentType}`,
      context.path,
    )
  }
  if ((input.sizeBytes ?? 0) > 2 * 1024 * 1024 * 1024) {
    fail(400, 'FILE_TOO_LARGE', 'Source files are limited to 2 GB', context.path)
  }
  const sourceKey = `sources/${episode.seriesId}/${episode.id}/${input.fileName}`
  touch(episode, { sourceKey, transcodeStatus: 'PENDING', transcodeError: null })
  return {
    uploadUrl: mockUploadUrlFor(sourceKey),
    method: 'PUT',
    headers: { 'Content-Type': input.contentType },
    sourceKey,
    expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
  }
})

route('POST', '/admin/episodes/:id/uploaded', (context): AdminEpisode => {
  requireRole(context, ['EDITOR', 'ADMIN'])
  const episode = findEpisode(context, context.params.id as string)
  if (!episode.sourceKey) {
    fail(409, 'EPISODE_NOT_UPLOADED', 'Request an upload URL first', context.path)
  }
  touch(episode, { transcodeStatus: 'UPLOADED', transcodeError: null })
  scheduleTranscode(episode.id)
  return clone(episode)
})

route('POST', '/admin/episodes/:id/retranscode', (context): AdminEpisode => {
  requireRole(context, ['EDITOR', 'ADMIN'])
  const episode = findEpisode(context, context.params.id as string)
  if (!episode.sourceKey) {
    fail(409, 'EPISODE_NOT_UPLOADED', 'No source file to transcode', context.path)
  }
  // The retry of the fixture's failed episode succeeds (its source key does not contain "fail").
  touch(episode, { transcodeStatus: 'UPLOADED', transcodeError: null })
  scheduleTranscode(episode.id)
  return clone(episode)
})

route('POST', '/admin/uploads/presign', (context): PresignResponse => {
  requireRole(context, ['EDITOR', 'ADMIN'])
  const input = (context.body ?? {}) as Partial<PresignRequest>
  if (input.kind !== 'poster' || !input.fileName || !input.contentType) {
    fail(400, 'VALIDATION_ERROR', 'kind, fileName and contentType are required', context.path)
  }
  if (!input.contentType.startsWith('image/')) {
    fail(
      400,
      'UNSUPPORTED_MEDIA_TYPE',
      `Unsupported content type ${input.contentType}`,
      context.path,
    )
  }
  const key = `posters/${newId('pst').toLowerCase()}/${input.fileName}`
  return {
    uploadUrl: mockUploadUrlFor(key),
    method: 'PUT',
    headers: { 'Content-Type': input.contentType },
    key,
    publicUrl: mockAssetUrlFor(key),
  }
})

// --- subtitles (B-03) ---------------------------------------------------------

function episodeSubtitles(episodeId: string): Subtitle[] {
  return state.subtitles.filter((subtitle) => subtitle.episodeId === episodeId)
}

route('GET', '/admin/episodes/:id/subtitles', (context): Subtitle[] => {
  requireAuth(context)
  const episode = findEpisode(context, context.params.id as string)
  return clone(episodeSubtitles(episode.id))
})

route('POST', '/admin/episodes/:id/subtitles', async (context): Promise<Subtitle> => {
  requireRole(context, ['EDITOR', 'ADMIN'])
  const episode = findEpisode(context, context.params.id as string)
  const body = context.body
  if (!(typeof FormData !== 'undefined' && body instanceof FormData)) {
    fail(400, 'VALIDATION_ERROR', 'multipart form expected (file, language)', context.path)
  }
  const file = body.get('file')
  const language = normalizeLanguageCode(String(body.get('language') ?? ''))
  if (!(file instanceof Blob)) {
    fail(400, 'VALIDATION_ERROR', 'file is required', context.path)
  }
  if (!isIsoLanguageCode(language)) {
    fail(400, 'VALIDATION_ERROR', 'language must be an ISO 639-1 code', context.path)
  }
  const fileName = 'name' in file ? String((file as File).name) : 'subtitle.vtt'
  const problem = validateSubtitleFile({ name: fileName, size: file.size })
  if (problem === 'type') {
    fail(400, 'UNSUPPORTED_MEDIA_TYPE', 'Only .srt and .vtt files are accepted', context.path)
  }
  if (problem === 'size') {
    fail(
      400,
      'FILE_TOO_LARGE',
      `Subtitle files are limited to ${SUBTITLE_MAX_FILE_BYTES} bytes`,
      context.path,
    )
  }
  if (problem === 'empty') fail(400, 'VALIDATION_ERROR', 'file is empty', context.path)

  const text = await file.text()
  const vtt = isVtt(text) ? text : srtToVtt(text)
  const key = subtitleKey(episode.id, language)
  registerMockAsset(mockUploadUrlFor(key), new Blob([vtt], { type: 'text/vtt' }))

  const existing = episodeSubtitles(episode.id).find((item) => item.language === language)
  const subtitle: Subtitle = {
    id: existing?.id ?? newId('sub'),
    episodeId: episode.id,
    language,
    fileUrl: mockAssetUrlFor(key),
    label: languageName(language, language),
    createdAt: now(),
  }
  state.subtitles = [...state.subtitles.filter((item) => item.id !== subtitle.id), subtitle]
  audit(
    context,
    existing ? 'subtitle.replace' : 'subtitle.create',
    'subtitle',
    subtitle.id,
    existing ? { language, fileName: existing.fileUrl } : null,
    { episodeId: episode.id, language, fileName },
  )
  return clone(subtitle)
})

route('DELETE', '/admin/subtitles/:id', (context) => {
  requireRole(context, ['EDITOR', 'ADMIN'])
  const subtitle = state.subtitles.find((item) => item.id === context.params.id)
  if (!subtitle)
    fail(404, 'SUBTITLE_NOT_FOUND', `Subtitle ${context.params.id} not found`, context.path)
  state.subtitles = state.subtitles.filter((item) => item.id !== subtitle.id)
  audit(
    context,
    'subtitle.delete',
    'subtitle',
    subtitle.id,
    { episodeId: subtitle.episodeId, language: subtitle.language },
    null,
  )
  return null
})

// --- home curation (B-05) -------------------------------------------------------

function sortedBanners(): HomeBanner[] {
  return [...state.banners].sort((a, b) => a.position - b.position)
}

function sortedRows(): HomeRow[] {
  return [...state.rows].sort((a, b) => a.position - b.position)
}

function readCountries(context: MockContext, value: unknown): string[] {
  if (value === undefined) return []
  if (!Array.isArray(value))
    fail(400, 'VALIDATION_ERROR', 'countries must be an array', context.path)
  const codes = Array.from(new Set(value.map((code) => normalizeCountryCode(String(code)))))
  if (codes.some((code) => !isIsoCountryCode(code))) {
    fail(400, 'VALIDATION_ERROR', 'countries must be ISO 3166-1 alpha-2 codes', context.path)
  }
  return codes
}

function applyBannerInput(context: MockContext, target: HomeBanner, input: HomeBannerInput): void {
  requireRole(context, ['EDITOR', 'ADMIN'])
  if (input.seriesId !== undefined) {
    findSeries(context, String(input.seriesId))
    target.seriesId = String(input.seriesId)
  }
  if (input.title !== undefined) target.title = String(input.title).trim()
  if (input.subtitle !== undefined)
    target.subtitle = input.subtitle ? String(input.subtitle).trim() : null
  if (input.imageUrl !== undefined) target.imageUrl = input.imageUrl ? String(input.imageUrl) : null
  if (input.countries !== undefined) target.countries = readCountries(context, input.countries)
  if (input.isActive !== undefined) target.isActive = Boolean(input.isActive)
  if (input.startsAt !== undefined) target.startsAt = input.startsAt || null
  if (input.endsAt !== undefined) target.endsAt = input.endsAt || null
  if (!target.seriesId) fail(400, 'VALIDATION_ERROR', 'seriesId is required', context.path)
  if (!target.title) fail(400, 'VALIDATION_ERROR', 'title is required', context.path)
  if (target.startsAt && target.endsAt && target.endsAt < target.startsAt) {
    fail(400, 'VALIDATION_ERROR', 'endsAt must be after startsAt', context.path)
  }
}

route('GET', '/admin/home/banners', (context): HomeBanner[] => {
  requireAuth(context)
  return clone(sortedBanners())
})

route('POST', '/admin/home/banners', (context): HomeBanner => {
  const banner: HomeBanner = {
    id: newId('bnr'),
    seriesId: '',
    imageUrl: null,
    title: '',
    subtitle: null,
    countries: [],
    position: state.banners.length + 1,
    isActive: true,
    startsAt: null,
    endsAt: null,
  }
  applyBannerInput(context, banner, (context.body ?? {}) as HomeBannerInput)
  state.banners.push(banner)
  audit(context, 'home_banner.create', 'home_banner', banner.id, null, context.body)
  return clone(banner)
})

route('PUT', '/admin/home/banners/order', (context): HomeBanner[] => {
  requireRole(context, ['EDITOR', 'ADMIN'])
  const { ids } = (context.body ?? {}) as Partial<HomeOrderInput>
  const known = new Set(state.banners.map((banner) => banner.id))
  if (!Array.isArray(ids) || ids.length !== known.size || !ids.every((id) => known.has(id))) {
    fail(400, 'VALIDATION_ERROR', 'ids must list every banner exactly once', context.path)
  }
  const before = sortedBanners().map((banner) => banner.id)
  ids.forEach((id, index) => {
    const banner = state.banners.find((item) => item.id === id)
    if (banner) banner.position = index + 1
  })
  audit(context, 'home_banner.reorder', 'home_banner', null, { ids: before }, { ids })
  return clone(sortedBanners())
})

route('PATCH', '/admin/home/banners/:id', (context): HomeBanner => {
  const banner = state.banners.find((item) => item.id === context.params.id)
  if (!banner) fail(404, 'BANNER_NOT_FOUND', `Banner ${context.params.id} not found`, context.path)
  const before = clone(banner)
  const input = (context.body ?? {}) as HomeBannerInput
  applyBannerInput(context, banner, input)
  const keys = Object.keys(input) as (keyof HomeBannerInput)[]
  audit(
    context,
    'home_banner.update',
    'home_banner',
    banner.id,
    Object.fromEntries(keys.map((key) => [key, before[key]])),
    Object.fromEntries(keys.map((key) => [key, banner[key]])),
  )
  return clone(banner)
})

route('DELETE', '/admin/home/banners/:id', (context) => {
  requireRole(context, ['EDITOR', 'ADMIN'])
  const banner = state.banners.find((item) => item.id === context.params.id)
  if (!banner) fail(404, 'BANNER_NOT_FOUND', `Banner ${context.params.id} not found`, context.path)
  state.banners = state.banners.filter((item) => item.id !== banner.id)
  sortedBanners().forEach((item, index) => {
    item.position = index + 1
  })
  audit(
    context,
    'home_banner.delete',
    'home_banner',
    banner.id,
    { title: banner.title, seriesId: banner.seriesId },
    null,
  )
  return null
})

function applyRowInput(context: MockContext, target: HomeRow, input: HomeRowInput): void {
  requireRole(context, ['EDITOR', 'ADMIN'])
  if (input.key !== undefined) {
    const key = String(input.key).trim()
    if (!HOME_ROW_KEY_RE.test(key)) {
      fail(
        400,
        'VALIDATION_ERROR',
        'key must be 2-80 lowercase letters, digits, "-" or "_"',
        context.path,
      )
    }
    if (state.rows.some((row) => row.key === key && row.id !== target.id)) {
      fail(409, 'HOME_ROW_KEY_TAKEN', `A row with key "${key}" already exists`, context.path)
    }
    target.key = key
  }
  if (input.type !== undefined) {
    if (!HOME_ROW_TYPES.includes(input.type)) {
      fail(400, 'VALIDATION_ERROR', `Unknown row type ${String(input.type)}`, context.path)
    }
    target.type = input.type
  }
  if (input.titles !== undefined) {
    // Like the backend: `titles` is replaced as a whole (missing languages become null).
    const given = input.titles as Partial<HomeRowTitles>
    const titles: HomeRowTitles = { fr: String(given.fr ?? '').trim() }
    for (const lang of HOME_TITLE_LANGUAGES) {
      if (lang === 'fr') continue
      const value = given[lang]
      titles[lang] = value ? String(value).trim() || null : null
    }
    target.titles = titles
  }
  if (input.genre !== undefined) target.genre = input.genre ? String(input.genre) : null
  if (input.seriesIds !== undefined) {
    if (!Array.isArray(input.seriesIds)) {
      fail(400, 'VALIDATION_ERROR', 'seriesIds must be an array', context.path)
    }
    input.seriesIds.forEach((id) => findSeries(context, String(id)))
    target.seriesIds = input.seriesIds.map(String)
  }
  if (input.countries !== undefined) target.countries = readCountries(context, input.countries)
  if (input.isActive !== undefined) target.isActive = Boolean(input.isActive)

  if (!target.titles.fr) fail(400, 'VALIDATION_ERROR', 'titles.fr is required', context.path)
  if (target.type === 'GENRE') {
    if (!target.genre || !(SERIES_GENRES as readonly string[]).includes(target.genre)) {
      fail(400, 'VALIDATION_ERROR', 'genre is required for GENRE rows', context.path)
    }
  } else {
    target.genre = null
  }
  if (target.type === 'MANUAL') {
    if (target.seriesIds.length === 0) {
      fail(400, 'VALIDATION_ERROR', 'seriesIds is required for MANUAL rows', context.path)
    }
  } else {
    target.seriesIds = []
  }
  if (!target.key) fail(400, 'VALIDATION_ERROR', 'key is required', context.path)
}

route('GET', '/admin/home/rows', (context): HomeRow[] => {
  requireAuth(context)
  return clone(sortedRows())
})

route('POST', '/admin/home/rows', (context): HomeRow => {
  const row: HomeRow = {
    id: newId('row'),
    key: '',
    type: 'MANUAL',
    titles: { fr: '', en: '', es: '', pt: '' },
    genre: null,
    seriesIds: [],
    countries: [],
    position: state.rows.length + 1,
    isActive: true,
  }
  applyRowInput(context, row, (context.body ?? {}) as HomeRowInput)
  state.rows.push(row)
  audit(context, 'home_row.create', 'home_row', row.id, null, context.body)
  return clone(row)
})

route('PUT', '/admin/home/rows/order', (context): HomeRow[] => {
  requireRole(context, ['EDITOR', 'ADMIN'])
  const { ids } = (context.body ?? {}) as Partial<HomeOrderInput>
  const known = new Set(state.rows.map((row) => row.id))
  if (!Array.isArray(ids) || ids.length !== known.size || !ids.every((id) => known.has(id))) {
    fail(400, 'VALIDATION_ERROR', 'ids must list every row exactly once', context.path)
  }
  const before = sortedRows().map((row) => row.id)
  ids.forEach((id, index) => {
    const row = state.rows.find((item) => item.id === id)
    if (row) row.position = index + 1
  })
  audit(context, 'home_row.reorder', 'home_row', null, { ids: before }, { ids })
  return clone(sortedRows())
})

route('PATCH', '/admin/home/rows/:id', (context): HomeRow => {
  const row = state.rows.find((item) => item.id === context.params.id)
  if (!row) fail(404, 'ROW_NOT_FOUND', `Row ${context.params.id} not found`, context.path)
  const before = clone(row)
  const input = (context.body ?? {}) as HomeRowInput
  applyRowInput(context, row, input)
  const keys = Object.keys(input) as (keyof HomeRowInput)[]
  audit(
    context,
    'home_row.update',
    'home_row',
    row.id,
    Object.fromEntries(keys.map((key) => [key, before[key]])),
    Object.fromEntries(keys.map((key) => [key, row[key]])),
  )
  return clone(row)
})

route('DELETE', '/admin/home/rows/:id', (context) => {
  requireRole(context, ['EDITOR', 'ADMIN'])
  const row = state.rows.find((item) => item.id === context.params.id)
  if (!row) fail(404, 'ROW_NOT_FOUND', `Row ${context.params.id} not found`, context.path)
  state.rows = state.rows.filter((item) => item.id !== row.id)
  sortedRows().forEach((item, index) => {
    item.position = index + 1
  })
  audit(context, 'home_row.delete', 'home_row', row.id, { key: row.key, titles: row.titles }, null)
  return null
})

function publicSummary(series: AdminSeries): PublicSeriesSummary {
  return {
    id: series.id,
    slug: series.slug,
    title: series.title,
    genres: [...series.genres],
    posterVerticalUrl: series.posterVerticalUrl,
    posterHorizontalUrl: series.posterHorizontalUrl,
    episodeCount: seriesEpisodes(series.id).filter((e) => e.transcodeStatus === 'READY').length,
    freeEpisodeCount: series.freeEpisodeCount,
    coinCostPerEpisode: series.coinCostPerEpisode,
    ageRating: series.ageRating,
    publishedAt: series.publishedAt,
  }
}

function availableIn(countries: readonly string[], country: string): boolean {
  return countries.length === 0 || countries.includes(country)
}

/** Same rules as the public `GET /home` of the contract, for an anonymous viewer. */
route('GET', '/admin/home/preview', (context): PublicHomeResponse => {
  requireAuth(context)
  const country = normalizeCountryCode(context.query.get('country') ?? 'FR') || 'FR'
  const lang = normalizeLanguageCode(context.query.get('lang') ?? 'fr') || 'fr'
  const nowIso = now()
  const published = state.series.filter(
    (series) => series.status === 'PUBLISHED' && availableIn(series.territories, country),
  )
  const byId = new Map(published.map((series) => [series.id, series]))

  const banners = sortedBanners()
    .filter(
      (banner) =>
        banner.isActive &&
        availableIn(banner.countries, country) &&
        (!banner.startsAt || banner.startsAt <= nowIso) &&
        (!banner.endsAt || banner.endsAt >= nowIso) &&
        byId.has(banner.seriesId),
    )
    .map((banner) => ({
      id: banner.id,
      seriesId: banner.seriesId,
      imageUrl: banner.imageUrl,
      title: banner.title,
      subtitle: banner.subtitle,
      series: publicSummary(byId.get(banner.seriesId) as AdminSeries),
    }))

  const rows = sortedRows()
    .filter((row) => row.isActive && availableIn(row.countries, country))
    .map((row) => {
      let items: AdminSeries[]
      switch (row.type) {
        case 'TRENDING':
          items = [...published].sort((a, b) => b.episodeCount - a.episodeCount)
          break
        case 'NEW':
          items = [...published].sort((a, b) =>
            (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''),
          )
          break
        case 'GENRE':
          items = published.filter((series) => row.genre && series.genres.includes(row.genre))
          break
        case 'MANUAL':
          items = row.seriesIds.flatMap((id) => byId.get(id) ?? [])
          break
        default:
          items = [] // CONTINUE_WATCHING: empty for an anonymous preview
      }
      return {
        key: row.key,
        type: row.type,
        title: row.titles[lang as keyof HomeRowTitles] || row.titles.fr,
        items: items.map((series) => ({ series: publicSummary(series) })),
      }
    })
    .filter((row) => row.items.length > 0 || row.key === 'continue_watching')

  return { banners, rows }
})

// --- internal accounts and audit log (B-13) --------------------------------------

function toAdminAccount(account: MockAccount): AdminAccount {
  return {
    id: account.user.id,
    email: account.user.email,
    displayName: account.user.displayName,
    role: account.user.role,
    isActive: account.isActive,
    totpEnrolled: account.totpEnrolled,
    lastLoginAt: account.lastLoginAt,
    createdAt: account.createdAt,
  }
}

function findAccount(context: MockContext, id: string): MockAccount {
  const account = state.accounts.find((item) => item.user.id === id)
  if (!account) fail(404, 'ACCOUNT_NOT_FOUND', `Account ${id} not found`, context.path)
  return account
}

route('GET', '/admin/accounts', (context): AdminAccount[] => {
  requireRole(context, ['ADMIN'])
  return state.accounts.map(toAdminAccount)
})

route('POST', '/admin/accounts', (context): AdminAccount => {
  requireRole(context, ['ADMIN'])
  const input = (context.body ?? {}) as Partial<AdminAccountCreateInput>
  const email = String(input.email ?? '')
    .trim()
    .toLowerCase()
  const displayName = String(input.displayName ?? '').trim()
  if (!email || !displayName || !input.password) {
    fail(
      400,
      'VALIDATION_ERROR',
      'email, displayName, role and password are required',
      context.path,
    )
  }
  if (!input.role || !ADMIN_ROLES.includes(input.role)) {
    fail(400, 'VALIDATION_ERROR', `Unknown role ${String(input.role)}`, context.path)
  }
  if (passwordProblems(String(input.password)).length > 0) {
    fail(
      400,
      'WEAK_PASSWORD',
      'Password must be 12+ characters with upper, lower case and a digit',
      context.path,
    )
  }
  if (state.accounts.some((item) => item.user.email === email)) {
    fail(409, 'EMAIL_ALREADY_USED', `An account already exists for ${email}`, context.path)
  }
  const id = newId('adm')
  const account: MockAccount = {
    token: `mock-access-token-${id.toLowerCase()}`,
    totpEnrolled: false,
    isActive: true,
    lastLoginAt: null,
    createdAt: now(),
    password: String(input.password),
    user: { id, email, displayName, role: input.role },
  }
  state.accounts.push(account)
  audit(context, 'admin_account.create', 'admin_account', id, null, {
    email,
    displayName,
    role: input.role,
  })
  return toAdminAccount(account)
})

route('PATCH', '/admin/accounts/:id', (context): AdminAccount => {
  const actor = requireRole(context, ['ADMIN'])
  const account = findAccount(context, context.params.id as string)
  const input = (context.body ?? {}) as AdminAccountUpdateInput
  const before = toAdminAccount(account)
  if (actor.id === account.user.id) {
    if (input.isActive === false) {
      fail(409, 'ADMIN_SELF_LOCKOUT', 'You cannot deactivate your own account', context.path)
    }
    if (input.role !== undefined && input.role !== 'ADMIN') {
      fail(409, 'ADMIN_SELF_LOCKOUT', 'You cannot remove your own ADMIN role', context.path)
    }
  }
  if (input.role !== undefined) {
    if (!ADMIN_ROLES.includes(input.role)) {
      fail(400, 'VALIDATION_ERROR', `Unknown role ${String(input.role)}`, context.path)
    }
    account.user.role = input.role
  }
  if (input.displayName !== undefined) {
    const displayName = String(input.displayName).trim()
    if (!displayName) fail(400, 'VALIDATION_ERROR', 'displayName cannot be empty', context.path)
    account.user.displayName = displayName
  }
  if (input.isActive !== undefined) account.isActive = Boolean(input.isActive)
  const after = toAdminAccount(account)
  const keys = Object.keys(input) as (keyof AdminAccountUpdateInput)[]
  audit(
    context,
    'admin_account.update',
    'admin_account',
    account.user.id,
    Object.fromEntries(keys.map((key) => [key, before[key]])),
    Object.fromEntries(keys.map((key) => [key, after[key]])),
  )
  return after
})

route('POST', '/admin/accounts/:id/revoke-devices', (context) => {
  requireRole(context, ['ADMIN'])
  const account = findAccount(context, context.params.id as string)
  const revoked = revokeDevicesOf(account.user.id)
  audit(context, 'admin_account.revoke_devices', 'admin_account', account.user.id, null, {
    revoked,
  })
  return null
})

route('POST', '/admin/accounts/:id/reset-totp', (context): AdminAccount => {
  requireRole(context, ['ADMIN'])
  const account = findAccount(context, context.params.id as string)
  account.totpEnrolled = false
  // Resetting TOTP revokes every trusted device (contract v1.3).
  revokeDevicesOf(account.user.id)
  audit(
    context,
    'admin_account.reset_totp',
    'admin_account',
    account.user.id,
    { totpEnrolled: true },
    { totpEnrolled: false },
  )
  return toAdminAccount(account)
})

route('POST', '/admin/accounts/:id/reset-password', (context) => {
  requireRole(context, ['ADMIN'])
  const account = findAccount(context, context.params.id as string)
  const { password } = (context.body ?? {}) as Partial<AdminAccountResetPasswordInput>
  if (!password || passwordProblems(password).length > 0) {
    fail(
      400,
      'WEAK_PASSWORD',
      'Password must be 12+ characters with upper, lower case and a digit',
      context.path,
    )
  }
  account.password = password
  audit(context, 'admin_account.reset_password', 'admin_account', account.user.id, null, {
    email: account.user.email,
  })
  return null
})

route('GET', '/admin/audit-logs', (context): Paginated<AuditLog> => {
  requireRole(context, ['ADMIN'])
  const query = context.query
  const page = Math.max(1, Number(query.get('page') ?? 1))
  const pageSize = Math.min(100, Math.max(1, Number(query.get('pageSize') ?? 20)))
  const actorId = query.get('actorId')
  const action = (query.get('action') ?? '').trim().toLowerCase()
  const targetType = query.get('targetType')
  const targetId = query.get('targetId')
  const from = query.get('from')
  const to = query.get('to')
  const filtered = state.auditLogs
    .filter((log) => !actorId || log.actorId === actorId)
    .filter((log) => !action || log.action.toLowerCase().includes(action))
    .filter((log) => !targetType || log.targetType === targetType)
    .filter((log) => !targetId || log.targetId === targetId)
    .filter((log) => !from || log.createdAt >= from)
    .filter((log) => !to || log.createdAt <= to)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const start = (page - 1) * pageSize
  return {
    items: clone(filtered.slice(start, start + pageSize)),
    total: filtered.length,
    page,
    pageSize,
  }
})

// ---------------------------------------------------------------------------
// Scheduling (B-04) and dashboard v0 (B-11) — public contract v1.2
// ---------------------------------------------------------------------------

function readIsoBound(context: MockContext, name: string, fallback: string): string {
  const raw = context.query.get(name)
  if (raw === null || raw === '') return fallback
  const time = new Date(raw).getTime()
  if (Number.isNaN(time)) {
    fail(400, 'VALIDATION_ERROR', `${name} must be an ISO date-time`, context.path)
  }
  return new Date(time).toISOString()
}

/** Series and episodes dated inside [from, to] (default: the next 30 days), soonest first. */
route('GET', '/admin/schedule', (context): ScheduleApiResponse => {
  requireAuth(context)
  const nowIso = now()
  const from = readIsoBound(context, 'from', nowIso)
  const to = readIsoBound(
    context,
    'to',
    new Date(new Date(from).getTime() + 30 * 86_400_000).toISOString(),
  )
  if (to < from) fail(400, 'VALIDATION_ERROR', 'to must be after from', context.path)
  const inRange = (value: string | null): value is string =>
    value !== null && value >= from && value <= to
  const items: ScheduleApiItem[] = []
  for (const series of state.series) {
    if (series.status === 'ARCHIVED' || !inRange(series.publishedAt)) continue
    items.push({
      kind: 'series',
      id: series.id,
      seriesId: series.id,
      seriesTitle: series.title,
      seriesStatus: series.status,
      episodeNumber: null,
      episodeTitle: null,
      transcodeStatus: null,
      publishedAt: series.publishedAt,
      willBeVisible: series.status === 'PUBLISHED',
    })
  }
  for (const episode of state.episodes) {
    if (!inRange(episode.publishedAt)) continue
    const series = state.series.find((item) => item.id === episode.seriesId)
    if (!series || series.status === 'ARCHIVED') continue
    items.push({
      kind: 'episode',
      id: episode.id,
      seriesId: series.id,
      seriesTitle: series.title,
      seriesStatus: series.status,
      episodeNumber: episode.number,
      episodeTitle: episode.title,
      transcodeStatus: episode.transcodeStatus,
      publishedAt: episode.publishedAt,
      willBeVisible: series.status === 'PUBLISHED' && episode.transcodeStatus === 'READY',
    })
  }
  items.sort((a, b) => a.publishedAt.localeCompare(b.publishedAt) || a.id.localeCompare(b.id))
  return { items: clone(items), from, to }
})

/** Fixture numbers per period; `generatedAt` is "now" so the page shows a fresh timestamp. */
route('GET', '/admin/stats/overview', (context): StatsOverview => {
  requireAuth(context)
  const raw = context.query.get('days') ?? '7'
  if (!isStatsPeriod(raw)) {
    fail(400, 'VALIDATION_ERROR', 'days must be 7 or 30', context.path)
  }
  const period = String(Number(raw) as StatsPeriod) as keyof typeof statsFixture
  const overview = clone(statsFixture[period]) as Omit<StatsOverview, 'generatedAt'>
  // Keep the titles in sync with the (editable) mock catalogue.
  for (const row of overview.topSeries) {
    const series = state.series.find((item) => item.id === row.seriesId)
    if (series) row.title = series.title
  }
  return { ...overview, generatedAt: now() }
})

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

// --- push campaigns (B-10, contract v1.3) -------------------------------------

const CAMPAIGN_ROLES: AdminRole[] = ['MONETIZATION', 'ADMIN']

/** Fake audience: app users per country and followers per series. */
const AUDIENCE_TOTAL = 12_480
const AUDIENCE_BY_COUNTRY: Record<string, number> = {
  TG: 4120,
  CI: 2890,
  SN: 1740,
  BJ: 980,
  CM: 1260,
  FR: 860,
  BF: 390,
  ML: 240,
}
const FOLLOWERS_BY_SERIES: Record<string, number> = {
  ser_01HZX0A1B2C3D4E5F6G7H8J9K0: 5320,
  ser_01HZX0A1B2C3D4E5F6G7H8J9K1: 3875,
  ser_01HZX0A1B2C3D4E5F6G7H8J9K2: 0,
  ser_01HZX0A1B2C3D4E5F6G7H8J9K3: 1210,
}

function estimateAudience(segment: CampaignSegment): number {
  switch (segment.type) {
    case 'COUNTRY':
      return (segment.countries ?? []).reduce(
        (sum, code) => sum + (AUDIENCE_BY_COUNTRY[code] ?? 120),
        0,
      )
    case 'SERIES_FOLLOWERS':
      return segment.seriesId ? (FOLLOWERS_BY_SERIES[segment.seriesId] ?? 150) : 0
    case 'INACTIVE': {
      const days = segment.inactiveDays ?? 7
      // The longer the inactivity threshold, the smaller the audience.
      return Math.round(AUDIENCE_TOTAL * Math.max(0.03, 0.45 * Math.exp(-days / 20)))
    }
    default:
      return AUDIENCE_TOTAL
  }
}

function findCampaign(context: MockContext, id: string): Campaign {
  const campaign = state.campaigns.find((item) => item.id === id)
  if (!campaign) fail(404, 'CAMPAIGN_NOT_FOUND', `Campaign ${id} not found`, context.path)
  return campaign
}

function readSegment(context: MockContext, value: unknown): CampaignSegment {
  const input = (value ?? {}) as Partial<CampaignSegment>
  if (!input.type || !CAMPAIGN_SEGMENT_TYPES.includes(input.type)) {
    fail(400, 'VALIDATION_ERROR', `Unknown segment type ${String(input.type)}`, context.path)
  }
  switch (input.type) {
    case 'COUNTRY': {
      const countries = readCountries(context, input.countries ?? [])
      if (countries.length === 0) {
        fail(400, 'VALIDATION_ERROR', 'segment.countries is required', context.path)
      }
      return { type: 'COUNTRY', countries }
    }
    case 'SERIES_FOLLOWERS': {
      if (!input.seriesId)
        fail(400, 'VALIDATION_ERROR', 'segment.seriesId is required', context.path)
      findSeries(context, input.seriesId)
      return { type: 'SERIES_FOLLOWERS', seriesId: input.seriesId }
    }
    case 'INACTIVE': {
      const days = Number(input.inactiveDays)
      if (!Number.isInteger(days) || days < 1 || days > 365) {
        fail(400, 'VALIDATION_ERROR', 'segment.inactiveDays must be 1..365', context.path)
      }
      return { type: 'INACTIVE', inactiveDays: days }
    }
    default:
      return { type: 'ALL' }
  }
}

function applyCampaignInput(
  context: MockContext,
  target: Campaign,
  input: Partial<CampaignInput>,
): void {
  if ('title' in input) {
    const title = String(input.title ?? '').trim()
    if (!title) fail(400, 'VALIDATION_ERROR', 'title is required', context.path)
    target.title = title
  }
  if ('body' in input) {
    const body = String(input.body ?? '').trim()
    if (!body) fail(400, 'VALIDATION_ERROR', 'body is required', context.path)
    if (bodyRemaining(body) < 0) {
      fail(400, 'VALIDATION_ERROR', 'body exceeds 178 characters', context.path)
    }
    target.body = body
  }
  if ('deepLink' in input) {
    const link = input.deepLink ? String(input.deepLink).trim() : null
    if (link && !isValidDeepLink(link)) {
      fail(400, 'VALIDATION_ERROR', 'deepLink must start with drama://', context.path)
    }
    target.deepLink = link
  }
  if ('segment' in input) target.segment = readSegment(context, input.segment)
  if ('scheduledAt' in input) target.scheduledAt = readPublishedAt(context, input.scheduledAt)
  target.updatedAt = now()
}

function startSending(campaignId: string): void {
  later(mockTiming.campaignSendMs, () => {
    const campaign = state.campaigns.find((item) => item.id === campaignId)
    if (!campaign || campaign.status !== 'SENDING') return
    // Preferences (`offers` off) and the daily cap leave a few users out.
    campaign.sentCount = Math.round(campaign.audienceCount * 0.93)
    campaign.status = 'SENT'
    campaign.sentAt = now()
    campaign.updatedAt = now()
  })
}

/** A scheduled campaign whose date has passed starts sending when the list is read. */
function runDueCampaigns(): void {
  for (const campaign of state.campaigns) {
    if (
      campaign.status === 'SCHEDULED' &&
      campaign.scheduledAt &&
      new Date(campaign.scheduledAt).getTime() <= Date.now()
    ) {
      campaign.status = 'SENDING'
      campaign.updatedAt = now()
      startSending(campaign.id)
    }
  }
}

route('GET', '/admin/campaigns', (context): Paginated<Campaign> => {
  requireRole(context, CAMPAIGN_ROLES)
  runDueCampaigns()
  const status = context.query.get('status')
  const page = Math.max(1, Number(context.query.get('page') ?? 1))
  const pageSize = Math.min(100, Math.max(1, Number(context.query.get('pageSize') ?? 20)))
  const filtered = state.campaigns.filter((campaign) => !status || campaign.status === status)
  const start = (page - 1) * pageSize
  return {
    items: clone(filtered.slice(start, start + pageSize)),
    total: filtered.length,
    page,
    pageSize,
  }
})

route('POST', '/admin/campaigns', (context): Campaign => {
  const user = requireRole(context, CAMPAIGN_ROLES)
  const input = (context.body ?? {}) as Partial<CampaignInput>
  if (!input.title || !input.body || !input.segment) {
    fail(400, 'VALIDATION_ERROR', 'title, body and segment are required', context.path)
  }
  const campaign: Campaign = {
    id: newId('cmp'),
    title: '',
    body: '',
    deepLink: null,
    segment: { type: 'ALL' },
    scheduledAt: null,
    status: 'DRAFT',
    audienceCount: 0,
    sentCount: 0,
    createdBy: user.email,
    createdAt: now(),
    updatedAt: now(),
    sentAt: null,
    cancelledAt: null,
  }
  applyCampaignInput(context, campaign, input)
  campaign.audienceCount = estimateAudience(campaign.segment)
  state.campaigns.unshift(campaign)
  audit(context, 'campaign.create', 'campaign', campaign.id, null, campaign)
  return clone(campaign)
})

route('GET', '/admin/campaigns/:id', (context): Campaign => {
  requireRole(context, CAMPAIGN_ROLES)
  runDueCampaigns()
  return clone(findCampaign(context, context.params.id as string))
})

route('PATCH', '/admin/campaigns/:id', (context): Campaign => {
  requireRole(context, CAMPAIGN_ROLES)
  const campaign = findCampaign(context, context.params.id as string)
  if (!canEditCampaign(campaign.status)) {
    fail(
      409,
      'CAMPAIGN_NOT_EDITABLE',
      `A ${campaign.status} campaign cannot be edited`,
      context.path,
    )
  }
  const before = clone(campaign)
  applyCampaignInput(context, campaign, (context.body ?? {}) as Partial<CampaignInput>)
  campaign.audienceCount = estimateAudience(campaign.segment)
  audit(context, 'campaign.update', 'campaign', campaign.id, before, campaign)
  return clone(campaign)
})

route('DELETE', '/admin/campaigns/:id', (context) => {
  requireRole(context, CAMPAIGN_ROLES)
  const campaign = findCampaign(context, context.params.id as string)
  if (!canDeleteCampaign(campaign.status)) {
    fail(409, 'CAMPAIGN_NOT_DRAFT', 'Only drafts can be deleted', context.path)
  }
  state.campaigns = state.campaigns.filter((item) => item.id !== campaign.id)
  audit(context, 'campaign.delete', 'campaign', campaign.id, campaign, null)
  return null
})

route('POST', '/admin/campaigns/:id/estimate', (context): { audienceCount: number } => {
  requireRole(context, CAMPAIGN_ROLES)
  const campaign = findCampaign(context, context.params.id as string)
  campaign.audienceCount = estimateAudience(campaign.segment)
  return { audienceCount: campaign.audienceCount }
})

route('POST', '/admin/campaigns/:id/send', (context): Campaign => {
  requireRole(context, CAMPAIGN_ROLES)
  const campaign = findCampaign(context, context.params.id as string)
  if (!canSendCampaign(campaign.status)) {
    fail(409, 'CAMPAIGN_NOT_DRAFT', `A ${campaign.status} campaign cannot be sent`, context.path)
  }
  campaign.audienceCount = estimateAudience(campaign.segment)
  campaign.status = statusAfterSend(campaign.scheduledAt)
  campaign.updatedAt = now()
  if (campaign.status === 'SENDING') startSending(campaign.id)
  audit(context, 'campaign.send', 'campaign', campaign.id, null, {
    status: campaign.status,
    scheduledAt: campaign.scheduledAt,
  })
  return clone(campaign)
})

route('POST', '/admin/campaigns/:id/cancel', (context): Campaign => {
  requireRole(context, CAMPAIGN_ROLES)
  const campaign = findCampaign(context, context.params.id as string)
  if (!canCancelCampaign(campaign.status)) {
    fail(409, 'CAMPAIGN_NOT_SCHEDULED', 'Only scheduled campaigns can be cancelled', context.path)
  }
  campaign.status = 'CANCELLED'
  campaign.cancelledAt = now()
  campaign.updatedAt = now()
  audit(
    context,
    'campaign.cancel',
    'campaign',
    campaign.id,
    { status: 'SCHEDULED' },
    { status: 'CANCELLED' },
  )
  return clone(campaign)
})

// --- help center: FAQ and support (M-53 / B-03bis, contract v1.3) -------------

const FAQ_ROLES: AdminRole[] = ['EDITOR', 'SUPPORT', 'ADMIN']
const SUPPORT_ROLES: AdminRole[] = ['SUPPORT', 'ADMIN']

function findFaq(context: MockContext, id: string): FaqEntry {
  const entry = state.faq.find((item) => item.id === id)
  if (!entry) fail(404, 'FAQ_NOT_FOUND', `FAQ entry ${id} not found`, context.path)
  return entry
}

function readLocalized(context: MockContext, field: string, value: unknown): FaqLocalized {
  const input = (value ?? {}) as Partial<Record<string, unknown>>
  const fr = typeof input.fr === 'string' ? input.fr.trim() : ''
  if (!fr) fail(400, 'VALIDATION_ERROR', `${field}.fr is required`, context.path)
  const result: FaqLocalized = { fr }
  for (const lang of FAQ_LANGUAGES) {
    if (lang === 'fr') continue
    const text = input[lang]
    result[lang] = typeof text === 'string' && text.trim() ? text.trim() : null
  }
  return result
}

function applyFaqInput(context: MockContext, target: FaqEntry, input: FaqEntryInput): void {
  if ('category' in input) {
    const category = String(input.category ?? '').trim()
    if (!category) fail(400, 'VALIDATION_ERROR', 'category is required', context.path)
    target.category = category
  }
  if ('question' in input) target.question = readLocalized(context, 'question', input.question)
  if ('answer' in input) target.answer = readLocalized(context, 'answer', input.answer)
  if ('isPublished' in input) target.isPublished = Boolean(input.isPublished)
}

route('GET', '/help/faq', (context): PublicFaqResponse => {
  const lang = context.query.get('lang') ?? 'fr'
  return faqPreview(state.faq, lang)
})

route('GET', '/admin/faq', (context): FaqEntry[] => {
  requireRole(context, FAQ_ROLES)
  return clone(sortFaqEntries(state.faq))
})

route('POST', '/admin/faq', (context): FaqEntry => {
  requireRole(context, FAQ_ROLES)
  const input = (context.body ?? {}) as FaqEntryInput
  if (!input.category || !input.question || !input.answer) {
    fail(400, 'VALIDATION_ERROR', 'category, question and answer are required', context.path)
  }
  const entry: FaqEntry = {
    id: newId('faq'),
    category: '',
    question: { fr: '' },
    answer: { fr: '' },
    position: state.faq.length + 1,
    isPublished: false,
  }
  applyFaqInput(context, entry, input)
  state.faq.push(entry)
  audit(context, 'faq.create', 'faq', entry.id, null, entry)
  return clone(entry)
})

route('PATCH', '/admin/faq/:id', (context): FaqEntry => {
  requireRole(context, FAQ_ROLES)
  const entry = findFaq(context, context.params.id as string)
  const before = clone(entry)
  applyFaqInput(context, entry, (context.body ?? {}) as FaqEntryInput)
  audit(context, 'faq.update', 'faq', entry.id, before, entry)
  return clone(entry)
})

route('DELETE', '/admin/faq/:id', (context) => {
  requireRole(context, FAQ_ROLES)
  const entry = findFaq(context, context.params.id as string)
  state.faq = sortFaqEntries(state.faq.filter((item) => item.id !== entry.id)).map(
    (item, index) => ({ ...item, position: index + 1 }),
  )
  audit(context, 'faq.delete', 'faq', entry.id, entry, null)
  return null
})

route('PUT', '/admin/faq/order', (context): FaqEntry[] => {
  requireRole(context, FAQ_ROLES)
  const { ids } = (context.body ?? {}) as Partial<{ ids: string[] }>
  if (!Array.isArray(ids) || ids.length !== state.faq.length) {
    fail(400, 'VALIDATION_ERROR', 'ids must list every FAQ entry exactly once', context.path)
  }
  const byId = new Map(state.faq.map((entry) => [entry.id, entry]))
  if (new Set(ids).size !== ids.length || ids.some((id) => !byId.has(id))) {
    fail(400, 'VALIDATION_ERROR', 'ids must list every FAQ entry exactly once', context.path)
  }
  const before = sortFaqEntries(state.faq).map((entry) => entry.id)
  ids.forEach((id, index) => {
    const entry = byId.get(id) as FaqEntry
    entry.position = index + 1
  })
  state.faq = sortFaqEntries(state.faq)
  audit(context, 'faq.reorder', 'faq', null, before, ids)
  return clone(state.faq)
})

function findTicket(context: MockContext, id: string): SupportTicket {
  const ticket = state.tickets.find((item) => item.id === id)
  if (!ticket) fail(404, 'TICKET_NOT_FOUND', `Ticket ${id} not found`, context.path)
  return ticket
}

route('GET', '/admin/support/tickets', (context): Paginated<SupportTicket> => {
  requireRole(context, SUPPORT_ROLES)
  const status = context.query.get('status')
  if (status && !isTicketStatus(status)) {
    fail(400, 'VALIDATION_ERROR', `Unknown status ${status}`, context.path)
  }
  const page = Math.max(1, Number(context.query.get('page') ?? 1))
  const pageSize = Math.min(100, Math.max(1, Number(context.query.get('pageSize') ?? 20)))
  const filtered = sortTickets(state.tickets).filter(
    (ticket) => !status || ticket.status === (status as SupportTicketStatus),
  )
  const start = (page - 1) * pageSize
  return {
    items: clone(filtered.slice(start, start + pageSize)),
    total: filtered.length,
    page,
    pageSize,
  }
})

route('GET', '/admin/support/tickets/:id', (context): SupportTicket => {
  requireRole(context, SUPPORT_ROLES)
  return clone(findTicket(context, context.params.id as string))
})

route('POST', '/admin/support/tickets/:id/reply', (context): SupportTicket => {
  requireRole(context, SUPPORT_ROLES)
  const ticket = findTicket(context, context.params.id as string)
  const { message } = (context.body ?? {}) as Partial<{ message: string }>
  const body = typeof message === 'string' ? message.trim() : ''
  if (!body) fail(400, 'VALIDATION_ERROR', 'message is required', context.path)
  const next = ticketTransition(ticket.status, 'reply')
  if (!next) fail(409, 'TICKET_CLOSED', 'A closed ticket cannot be answered', context.path)
  ticket.messages.push({ from: 'support', body, at: now() })
  ticket.status = next
  ticket.updatedAt = now()
  audit(context, 'support_ticket.reply', 'support_ticket', ticket.id, null, { status: next })
  return clone(ticket)
})

route('POST', '/admin/support/tickets/:id/close', (context): SupportTicket => {
  requireRole(context, SUPPORT_ROLES)
  const ticket = findTicket(context, context.params.id as string)
  const next = ticketTransition(ticket.status, 'close')
  if (!next) fail(409, 'TICKET_CLOSED', 'The ticket is already closed', context.path)
  const before = ticket.status
  ticket.status = next
  ticket.updatedAt = now()
  audit(
    context,
    'support_ticket.close',
    'support_ticket',
    ticket.id,
    { status: before },
    { status: next },
  )
  return clone(ticket)
})

// ---------------------------------------------------------------------------
// Monetization (B-06), rewards (B-08) and users (B-09) — contract v1.4
// ---------------------------------------------------------------------------

const MONETIZATION_ROLES: AdminRole[] = ['MONETIZATION', 'ADMIN']
const USERS_ROLES: AdminRole[] = ['SUPPORT', 'ADMIN']

route('GET', '/admin/monetization/settings', (context): MonetizationSettings => {
  requireRole(context, MONETIZATION_ROLES)
  return clone(state.monetizationSettings)
})

route('PUT', '/admin/monetization/settings', (context): MonetizationSettings => {
  requireRole(context, MONETIZATION_ROLES)
  const input = { ...state.monetizationSettings, ...((context.body ?? {}) as object) }
  const errors = validateSettings(input as MonetizationSettings)
  if (Object.keys(errors).length > 0) {
    fail(
      400,
      'VALIDATION_ERROR',
      `Invalid settings: ${Object.keys(errors).join(', ')}`,
      context.path,
    )
  }
  const before = clone(state.monetizationSettings)
  state.monetizationSettings = {
    defaultFreeEpisodes: input.defaultFreeEpisodes,
    defaultCoinCost: input.defaultCoinCost,
    seriesUnlockDiscountPercent: input.seriesUnlockDiscountPercent,
    adDailyCap: input.adDailyCap,
    autoUnlockDefault: input.autoUnlockDefault,
    bonusValidityDays: input.bonusValidityDays,
  }
  audit(
    context,
    'monetization_settings.update',
    'monetization_settings',
    null,
    before,
    state.monetizationSettings,
  )
  return clone(state.monetizationSettings)
})

function readPrices(context: MockContext, value: unknown): Price[] {
  if (!Array.isArray(value) || value.length === 0) {
    fail(400, 'VALIDATION_ERROR', 'prices must contain at least one price', context.path)
  }
  const prices = value.map((item): Price => {
    const raw = item as Partial<Price>
    if (!isCurrency(raw.currency)) {
      fail(400, 'VALIDATION_ERROR', `Unknown currency ${String(raw.currency)}`, context.path)
    }
    if (!Number.isInteger(raw.amountMinor) || (raw.amountMinor as number) <= 0) {
      fail(400, 'VALIDATION_ERROR', 'amountMinor must be a positive integer', context.path)
    }
    return { currency: raw.currency, amountMinor: raw.amountMinor as number }
  })
  const currencies = new Set(prices.map((price) => price.currency))
  if (currencies.size !== prices.length) {
    fail(400, 'VALIDATION_ERROR', 'Duplicate currency in prices', context.path)
  }
  return prices
}

function readSku(context: MockContext, value: unknown, taken: readonly { sku: string }[]): string {
  const sku = String(value ?? '').trim()
  if (!isValidSku(sku)) {
    fail(400, 'VALIDATION_ERROR', 'sku must match the Play Console product id format', context.path)
  }
  if (taken.some((item) => item.sku === sku)) {
    fail(409, 'SKU_ALREADY_USED', `A product already uses the sku ${sku}`, context.path)
  }
  return sku
}

function readCount(context: MockContext, name: string, value: unknown, min: number): number {
  if (!Number.isInteger(value) || (value as number) < min) {
    fail(400, 'VALIDATION_ERROR', `${name} must be an integer >= ${min}`, context.path)
  }
  return value as number
}

function readBadge(context: MockContext, value: unknown): string | null {
  if (value === null || value === undefined) return null
  const badge = String(value).trim()
  if (badge.length > 30) fail(400, 'VALIDATION_ERROR', 'badge is too long (30)', context.path)
  return badge || null
}

/** The app shows one `price`: the XOF one by default (what `GET /shop` does per country). */
function withDisplayPrice<T extends { prices: Price[]; price?: Price }>(item: T): T {
  const price =
    item.prices.find((entry) => entry.currency === 'XOF') ??
    item.prices.find((entry) => entry.currency === 'USD') ??
    item.prices[0]
  return { ...item, price: price as Price }
}

function sortedPacks(): CoinPackAdmin[] {
  return [...state.packs].sort((a, b) => a.position - b.position).map(withDisplayPrice)
}

function findPack(context: MockContext, id: string): CoinPackAdmin {
  const pack = state.packs.find((item) => item.id === id)
  if (!pack) fail(404, 'PACK_NOT_FOUND', `Coin pack ${id} not found`, context.path)
  return pack
}

route('GET', '/admin/monetization/packs', (context): CoinPackAdmin[] => {
  requireRole(context, MONETIZATION_ROLES)
  return clone(sortedPacks())
})

route('POST', '/admin/monetization/packs', (context): CoinPackAdmin => {
  requireRole(context, MONETIZATION_ROLES)
  const input = (context.body ?? {}) as CoinPackInput
  const sku = readSku(context, input.sku, state.packs)
  const prices = readPrices(context, input.prices)
  const pack: CoinPackAdmin = withDisplayPrice({
    id: newId('pack'),
    sku,
    coins: readCount(context, 'coins', input.coins, 1),
    bonusCoins: readCount(context, 'bonusCoins', input.bonusCoins ?? 0, 0),
    badge: readBadge(context, input.badge),
    position: state.packs.length + 1,
    isActive: input.isActive ?? true,
    createdAt: now(),
    prices,
    price: prices[0] as Price,
  })
  state.packs.push(pack)
  audit(context, 'coin_pack.create', 'coin_pack', pack.id, null, pack)
  return clone(pack)
})

route('PUT', '/admin/monetization/packs/order', (context): CoinPackAdmin[] => {
  requireRole(context, MONETIZATION_ROLES)
  const { ids } = (context.body ?? {}) as Partial<MonetizationOrderInput>
  const known = new Set(state.packs.map((pack) => pack.id))
  if (!Array.isArray(ids) || ids.length !== known.size || ids.some((id) => !known.has(id))) {
    fail(400, 'VALIDATION_ERROR', 'ids must list every pack exactly once', context.path)
  }
  const before = sortedPacks().map((pack) => pack.id)
  ids.forEach((id, index) => {
    const pack = state.packs.find((item) => item.id === id) as CoinPackAdmin
    pack.position = index + 1
  })
  audit(context, 'coin_pack.reorder', 'coin_pack', null, { ids: before }, { ids })
  return clone(sortedPacks())
})

route('PATCH', '/admin/monetization/packs/:id', (context): CoinPackAdmin => {
  requireRole(context, MONETIZATION_ROLES)
  const pack = findPack(context, context.params.id as string)
  const input = (context.body ?? {}) as CoinPackInput
  if (input.sku !== undefined && input.sku !== pack.sku) {
    fail(400, 'SKU_IMMUTABLE', 'sku cannot be changed after creation', context.path)
  }
  const before = clone(pack)
  if (input.coins !== undefined) pack.coins = readCount(context, 'coins', input.coins, 1)
  if (input.bonusCoins !== undefined) {
    pack.bonusCoins = readCount(context, 'bonusCoins', input.bonusCoins, 0)
  }
  if (input.badge !== undefined) pack.badge = readBadge(context, input.badge)
  if (input.isActive !== undefined) pack.isActive = Boolean(input.isActive)
  if (input.prices !== undefined) {
    const prices = readPrices(context, input.prices)
    if (!samePrices(prices, pack.prices)) pack.prices = prices
  }
  Object.assign(pack, withDisplayPrice(pack))
  audit(context, 'coin_pack.update', 'coin_pack', pack.id, before, pack)
  return clone(pack)
})

route('DELETE', '/admin/monetization/packs/:id', (context) => {
  requireRole(context, MONETIZATION_ROLES)
  const pack = findPack(context, context.params.id as string)
  state.packs = state.packs.filter((item) => item.id !== pack.id)
  sortedPacks().forEach((item, index) => {
    const target = state.packs.find((candidate) => candidate.id === item.id) as CoinPackAdmin
    target.position = index + 1
  })
  audit(context, 'coin_pack.delete', 'coin_pack', pack.id, pack, null)
  return null
})

function findVipPlan(context: MockContext, id: string): VipPlanAdmin {
  const plan = state.vipPlans.find((item) => item.id === id)
  if (!plan) fail(404, 'VIP_PLAN_NOT_FOUND', `VIP plan ${id} not found`, context.path)
  return plan
}

route('GET', '/admin/monetization/vip-plans', (context): VipPlanAdmin[] => {
  requireRole(context, MONETIZATION_ROLES)
  return clone(sortVipPlans(state.vipPlans).map(withDisplayPrice))
})

route('POST', '/admin/monetization/vip-plans', (context): VipPlanAdmin => {
  requireRole(context, MONETIZATION_ROLES)
  const input = (context.body ?? {}) as VipPlanInput
  const sku = readSku(context, input.sku, state.vipPlans)
  if (!isVipPeriod(input.period)) {
    fail(400, 'VALIDATION_ERROR', 'period must be WEEK, MONTH or YEAR', context.path)
  }
  const prices = readPrices(context, input.prices)
  const plan: VipPlanAdmin = withDisplayPrice({
    id: newId('vip'),
    sku,
    period: input.period,
    trialDays: readCount(context, 'trialDays', input.trialDays ?? 0, 0),
    badge: readBadge(context, input.badge),
    position: state.vipPlans.length + 1,
    isActive: input.isActive ?? true,
    createdAt: now(),
    prices,
    price: prices[0] as Price,
  })
  state.vipPlans.push(plan)
  audit(context, 'vip_plan.create', 'vip_plan', plan.id, null, plan)
  return clone(plan)
})

route('PATCH', '/admin/monetization/vip-plans/:id', (context): VipPlanAdmin => {
  requireRole(context, MONETIZATION_ROLES)
  const plan = findVipPlan(context, context.params.id as string)
  const input = (context.body ?? {}) as VipPlanInput
  if (input.sku !== undefined && input.sku !== plan.sku) {
    fail(400, 'SKU_IMMUTABLE', 'sku cannot be changed after creation', context.path)
  }
  const before = clone(plan)
  if (input.period !== undefined) {
    if (!isVipPeriod(input.period)) {
      fail(400, 'VALIDATION_ERROR', 'period must be WEEK, MONTH or YEAR', context.path)
    }
    plan.period = input.period
  }
  if (input.trialDays !== undefined) {
    plan.trialDays = readCount(context, 'trialDays', input.trialDays, 0)
  }
  if (input.badge !== undefined) plan.badge = readBadge(context, input.badge)
  if (input.isActive !== undefined) plan.isActive = Boolean(input.isActive)
  if (input.prices !== undefined) plan.prices = readPrices(context, input.prices)
  Object.assign(plan, withDisplayPrice(plan))
  audit(context, 'vip_plan.update', 'vip_plan', plan.id, before, plan)
  return clone(plan)
})

route('DELETE', '/admin/monetization/vip-plans/:id', (context) => {
  requireRole(context, MONETIZATION_ROLES)
  const plan = findVipPlan(context, context.params.id as string)
  state.vipPlans = state.vipPlans.filter((item) => item.id !== plan.id)
  audit(context, 'vip_plan.delete', 'vip_plan', plan.id, plan, null)
  return null
})

// --- rewards (B-08) ----------------------------------------------------------

route('GET', '/admin/rewards/checkin', (context): CheckinScale => {
  requireRole(context, MONETIZATION_ROLES)
  return clone(state.checkin)
})

route('PUT', '/admin/rewards/checkin', (context): CheckinScale => {
  requireRole(context, MONETIZATION_ROLES)
  const input = (context.body ?? {}) as Partial<CheckinScale>
  if (!Array.isArray(input.days) || input.days.length !== 7) {
    fail(400, 'VALIDATION_ERROR', 'days must contain exactly 7 integers', context.path)
  }
  const scale: CheckinScale = {
    days: normalizeCheckinDays(input.days),
    resetOnMiss: Boolean(input.resetOnMiss),
  }
  if (
    input.days.some((value) => !Number.isInteger(value) || (value as number) < 0) ||
    hasCheckinErrors(validateCheckinScale(scale))
  ) {
    fail(400, 'VALIDATION_ERROR', 'days must be 7 non-negative integers', context.path)
  }
  const before = clone(state.checkin)
  state.checkin = scale
  audit(context, 'checkin_scale.update', 'checkin_scale', null, before, scale)
  return clone(scale)
})

// --- users (B-09) ------------------------------------------------------------

function walletOf(entry: MockUser): Wallet {
  const purchased = entry.ledger
    .filter((line) => line.bucket === 'PURCHASED')
    .reduce((sum, line) => sum + line.amount, 0)
  const bonus = entry.ledger
    .filter((line) => line.bucket === 'BONUS')
    .reduce((sum, line) => sum + line.amount, 0)
  const bonusExpiring = entry.ledger
    .filter((line) => line.bucket === 'BONUS' && line.amount > 0 && line.expiresAt)
    .filter((line) => new Date(line.expiresAt as string).getTime() > Date.now())
    .map((line) => ({ amount: line.amount, expiresAt: line.expiresAt as string }))
    .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt))
  return {
    purchased,
    bonus,
    total: purchased + bonus,
    autoUnlock: entry.user.autoUnlock,
    bonusExpiring,
  }
}

function toUserSummary(entry: MockUser): AdminUserSummary {
  const { user } = entry
  return {
    id: user.id,
    type: user.type,
    status: user.status,
    displayName: user.displayName,
    email: user.email,
    phone: user.phone,
    country: user.country,
    language: user.language,
    vipStatus: user.vipStatus,
    balance: (({ purchased, bonus, total }) => ({ purchased, bonus, total }))(walletOf(entry)),
    lastSeenAt: user.lastSeenAt ?? null,
    createdAt: user.createdAt,
  }
}

function findUser(context: MockContext, id: string): MockUser {
  const entry = state.users.find((item) => item.user.id === id)
  if (!entry) fail(404, 'USER_NOT_FOUND', `User ${id} not found`, context.path)
  return entry
}

route('GET', '/admin/users', (context): Paginated<AdminUserSummary> => {
  requireRole(context, USERS_ROLES)
  const q = (context.query.get('q') ?? '').trim().toLowerCase()
  const page = Math.max(1, Number(context.query.get('page') ?? 1))
  const pageSize = Math.min(100, Math.max(1, Number(context.query.get('pageSize') ?? 20)))
  const digits = q.replace(/[^\d+]/g, '')
  const matches = state.users.filter(({ user }) => {
    if (!q) return true
    return (
      user.id.toLowerCase().startsWith(q) ||
      (user.email ?? '').toLowerCase().includes(q) ||
      (user.displayName ?? '').toLowerCase().includes(q) ||
      (digits.length >= 4 && (user.phone ?? '').replace(/[^\d+]/g, '').includes(digits))
    )
  })
  const sorted = [...matches].sort((a, b) =>
    (b.user.lastSeenAt ?? '').localeCompare(a.user.lastSeenAt ?? ''),
  )
  const start = (page - 1) * pageSize
  return {
    items: sorted.slice(start, start + pageSize).map(toUserSummary),
    total: sorted.length,
    page,
    pageSize,
  }
})

route('GET', '/admin/users/:id', (context): AdminUserDetail => {
  requireRole(context, USERS_ROLES)
  const entry = findUser(context, context.params.id as string)
  return clone({
    user: entry.user,
    wallet: walletOf(entry),
    subscription: entry.subscription,
    unlocks: [...entry.unlocks].sort((a, b) => b.at.localeCompare(a.at)),
    purchases: [...entry.purchases].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    recentLedger: sortLedger(entry.ledger),
    devices: entry.devices,
    lastSeenAt: entry.user.lastSeenAt ?? null,
  })
})

function readReason(context: MockContext, value: unknown): string {
  const reason = String(value ?? '').trim()
  if (reason.length < ADJUSTMENT_REASON_MIN) {
    fail(
      400,
      'REASON_REQUIRED',
      `reason must have at least ${ADJUSTMENT_REASON_MIN} characters`,
      context.path,
    )
  }
  return reason
}

route('POST', '/admin/users/:id/coins', (context): Wallet => {
  const actor = requireRole(context, USERS_ROLES)
  const entry = findUser(context, context.params.id as string)
  const input = (context.body ?? {}) as Partial<CoinAdjustmentInput>
  if (!Number.isInteger(input.amount) || input.amount === 0) {
    fail(400, 'VALIDATION_ERROR', 'amount must be a non-zero integer', context.path)
  }
  if (!input.bucket || !COIN_BUCKETS.includes(input.bucket)) {
    fail(400, 'VALIDATION_ERROR', 'bucket must be PURCHASED or BONUS', context.path)
  }
  const reason = readReason(context, input.reason)
  if (entry.user.status === 'DELETED' || entry.user.status === 'MERGED') {
    fail(409, 'USER_DELETED', 'This account no longer accepts coins', context.path)
  }
  const before = walletOf(entry)
  const amount = input.amount as number
  const projected = input.bucket === 'PURCHASED' ? before.purchased + amount : before.bonus + amount
  if (amount < 0 && projected < 0) {
    fail(409, 'INSUFFICIENT_COINS', 'The debit exceeds the balance of this bucket', context.path)
  }
  const line: LedgerEntry = {
    id: newId('led'),
    amount,
    bucket: input.bucket,
    type: 'ADJUSTMENT',
    reference: `admin:${actor.id}`,
    description: reason,
    expiresAt:
      input.bucket === 'BONUS' && amount > 0
        ? new Date(
            Date.now() + state.monetizationSettings.bonusValidityDays * 86_400_000,
          ).toISOString()
        : null,
    createdAt: now(),
  }
  entry.ledger.push(line)
  const after = walletOf(entry)
  audit(
    context,
    'user.coins_adjust',
    'user',
    entry.user.id,
    { purchased: before.purchased, bonus: before.bonus },
    { purchased: after.purchased, bonus: after.bonus, amount, bucket: input.bucket, reason },
  )
  return clone(after)
})

route('POST', '/admin/users/:id/block', (context): AppUser => {
  requireRole(context, USERS_ROLES)
  const entry = findUser(context, context.params.id as string)
  const reason = readReason(context, ((context.body ?? {}) as Partial<UserBlockInput>).reason)
  if (entry.user.status === 'BLOCKED') {
    fail(409, 'USER_ALREADY_BLOCKED', 'This user is already blocked', context.path)
  }
  if (entry.user.status === 'DELETED' || entry.user.status === 'MERGED') {
    fail(409, 'USER_DELETED', 'This account cannot be blocked', context.path)
  }
  const before = entry.user.status
  entry.user.status = 'BLOCKED'
  entry.devices = 0
  audit(
    context,
    'user.block',
    'user',
    entry.user.id,
    { status: before },
    { status: 'BLOCKED', reason },
  )
  return clone(entry.user)
})

route('POST', '/admin/users/:id/unblock', (context): AppUser => {
  requireRole(context, USERS_ROLES)
  const entry = findUser(context, context.params.id as string)
  const reason = readReason(context, ((context.body ?? {}) as Partial<UserBlockInput>).reason)
  if (entry.user.status !== 'BLOCKED') {
    fail(409, 'USER_NOT_BLOCKED', 'This user is not blocked', context.path)
  }
  entry.user.status = 'ACTIVE'
  audit(
    context,
    'user.unblock',
    'user',
    entry.user.id,
    { status: 'BLOCKED' },
    { status: 'ACTIVE', reason },
  )
  return clone(entry.user)
})

function stripQuery(path: string): string {
  const index = path.indexOf('?')
  return index === -1 ? path : path.slice(0, index)
}

function parseQuery(path: string): URLSearchParams {
  const index = path.indexOf('?')
  return new URLSearchParams(index === -1 ? '' : path.slice(index + 1))
}

/** Resolve a mock request. Throws `ApiError` like the real client would. */
export async function mockRequest<T>(request: MockRequest): Promise<T> {
  const path = stripQuery(request.path)
  await new Promise((resolve) => setTimeout(resolve, mockTiming.latencyMs))
  for (const candidate of routes) {
    if (candidate.method !== request.method) continue
    const match = candidate.pattern.exec(path)
    if (!match) continue
    const params: Record<string, string> = {}
    candidate.keys.forEach((key, index) => {
      params[key] = decodeURIComponent(match[index + 1] as string)
    })
    const account = request.token
      ? state.accounts.find((item) => item.token === request.token && item.isActive)
      : undefined
    return candidate.handler({
      ...request,
      path,
      params,
      query: parseQuery(request.path),
      user: account?.user ?? null,
    }) as T
  }
  throw ApiError.fromBody(404, 'NOT_FOUND', `No mock for ${request.method} ${path}`, path)
}

export function isAuthRoute(path: string): boolean {
  return authRoutes.has(stripQuery(path))
}

export const mockCredentials = authFixture.credentials

/** Demo accounts (email → role), shown on the login page in mock mode. */
export const mockAccounts = fixtureAccounts
  .filter((account) => account.isActive)
  .map(({ user }) => ({ email: user.email, role: user.role }))
