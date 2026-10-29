import { ApiError } from '../utils/api-error'
import type {
  AdminAccount,
  AdminAccountCreateInput,
  AdminAccountResetPasswordInput,
  AdminAccountUpdateInput,
  AdminEpisode,
  AdminEpisodeCreateInput,
  AdminEpisodeOrderInput,
  AdminEpisodeUpdateInput,
  AdminRole,
  AdminSeries,
  AdminSeriesInput,
  AdminUser,
  AuditLog,
  EpisodeUploadUrlRequest,
  EpisodeUploadUrlResponse,
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
  PublicHomeResponse,
  PublicSeriesSummary,
  SeriesStatus,
  Subtitle,
  TotpVerifyRequest,
  TotpVerifyResponse,
} from '../types/api'
import {
  ADMIN_ROLES,
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
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function initialState(): MockState {
  const subtitles = clone(subtitlesFixture) as Subtitle[]
  seedSubtitleAssets(subtitles)
  return {
    series: clone(seriesFixture) as AdminSeries[],
    episodes: clone(episodesFixture) as AdminEpisode[],
    subtitles,
    banners: clone(homeFixture.banners) as HomeBanner[],
    rows: clone(homeFixture.rows) as HomeRow[],
    accounts: clone(fixtureAccounts),
    auditLogs: clone(auditLogsFixture) as AuditLog[],
    challenges: new Map(),
  }
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
  const { email, password } = (body ?? {}) as Partial<LoginRequest>
  const account = state.accounts.find((item) => item.user.email === email?.trim().toLowerCase())
  const expected = account?.password ?? authFixture.credentials.password
  if (!account || password !== expected) {
    fail(401, 'INVALID_CREDENTIALS', 'Invalid credentials', path)
  }
  if (!account.isActive) {
    fail(401, 'ACCOUNT_DISABLED', 'This account is deactivated', path)
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

route('POST', '/admin/auth/totp/verify', ({ body, path }): TotpVerifyResponse => {
  const { challengeToken, code } = (body ?? {}) as Partial<TotpVerifyRequest>
  const account = challengeToken ? state.challenges.get(challengeToken) : undefined
  if (!account || code !== authFixture.credentials.totpCode) {
    fail(401, 'INVALID_TOTP', 'Invalid TOTP code', path)
  }
  state.challenges.delete(challengeToken as string)
  account.totpEnrolled = true
  account.lastLoginAt = now()
  state.auditLogs.unshift({
    id: newId('aud'),
    actorId: account.user.id,
    actorEmail: account.user.email,
    action: 'admin.login',
    targetType: 'admin_account',
    targetId: account.user.id,
    oldValue: null,
    newValue: { method: 'totp' },
    ip: '127.0.0.1',
    createdAt: now(),
  })
  return { accessToken: account.token, expiresIn: 8 * 3600, user: clone(account.user) }
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
  const input = (context.body ?? {}) as Partial<AdminSeriesInput>
  applySeriesInput(context, series, input)
  series.updatedAt = now()
  const changedKeys = Object.keys(input) as (keyof AdminSeriesInput)[]
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
  if (input.publishedAt !== undefined) episode.publishedAt = input.publishedAt
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

route('POST', '/admin/accounts/:id/reset-totp', (context): AdminAccount => {
  requireRole(context, ['ADMIN'])
  const account = findAccount(context, context.params.id as string)
  account.totpEnrolled = false
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
// Dispatcher
// ---------------------------------------------------------------------------

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
