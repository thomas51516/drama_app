import { ApiError } from '../utils/api-error'
import type {
  AdminEpisode,
  AdminEpisodeCreateInput,
  AdminEpisodeOrderInput,
  AdminEpisodeUpdateInput,
  AdminRole,
  AdminSeries,
  AdminSeriesInput,
  AdminUser,
  EpisodeUploadUrlRequest,
  EpisodeUploadUrlResponse,
  LoginRequest,
  LoginResponse,
  Paginated,
  PresignRequest,
  PresignResponse,
  SeriesStatus,
  TotpVerifyRequest,
  TotpVerifyResponse,
} from '../types/api'
import { MONETIZATION_FIELDS, SERIES_STATUSES } from '../types/api'
import authFixture from './auth.json'
import seriesFixture from './series.json'
import episodesFixture from './episodes.json'
import { mockAssetUrlFor, mockUploadUrlFor } from './assets'

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
  user: AdminUser
}

const accounts = authFixture.users as MockAccount[]

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface MockState {
  series: AdminSeries[]
  episodes: AdminEpisode[]
  challenges: Map<string, MockAccount>
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function initialState(): MockState {
  return {
    series: clone(seriesFixture) as AdminSeries[],
    episodes: clone(episodesFixture) as AdminEpisode[],
    challenges: new Map(),
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
  const account = accounts.find((item) => item.user.email === email?.trim().toLowerCase())
  if (!account || password !== authFixture.credentials.password) {
    fail(401, 'INVALID_CREDENTIALS', 'Invalid credentials', path)
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
  return { accessToken: account.token, expiresIn: 8 * 3600, user: account.user }
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
  return clone(series)
})

route('GET', '/admin/series/:id', (context): AdminSeries => {
  requireAuth(context)
  return clone(findSeries(context, context.params.id as string))
})

route('PATCH', '/admin/series/:id', (context): AdminSeries => {
  const series = findSeries(context, context.params.id as string)
  applySeriesInput(context, series, (context.body ?? {}) as Partial<AdminSeriesInput>)
  series.updatedAt = now()
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
  series.status = 'PUBLISHED'
  series.publishedAt = series.publishedAt ?? now()
  series.updatedAt = now()
  return clone(series)
})

route('POST', '/admin/series/:id/archive', (context): AdminSeries => {
  requireRole(context, ['EDITOR', 'ADMIN'])
  const series = findSeries(context, context.params.id as string)
  series.status = 'ARCHIVED'
  series.updatedAt = now()
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
  seriesEpisodes(episode.seriesId).forEach((item, index) => {
    item.number = index + 1
  })
  syncEpisodeCount(episode.seriesId)
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
      ? accounts.find((item) => item.token === request.token)
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
export const mockAccounts = accounts.map(({ user }) => ({ email: user.email, role: user.role }))
