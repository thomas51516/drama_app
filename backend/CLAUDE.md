# backend/ — conventions for agents

NestJS 12 (ESM, `"type": "module"`, imports end with `.js`), TypeScript strict, Prisma 7 + `@prisma/adapter-pg`, Vitest, ESLint (typed) + Prettier. Functional spec: `../docs/Cahier des charges…md` §8; tickets: `../docs/Backlog…md`.

## Layout

- One folder per business module (spec §8.2): `auth`, `catalog` (`CatalogService` + `HomeService`), `playback`, `unlock`, `wallet`, `billing`, `rewards`, `users`, `admin` (sub-modules `auth/`, `series/`, `episodes/`, `subtitles/`, `home/`, `accounts/`, `audit/`), plus `health`, `metrics`, `storage` (S3), `transcode` (BullMQ + ffmpeg / webhook), `cache/` (global `CatalogCacheService`). Each has `<name>.module.ts`, `<name>.controller.ts`, `<name>.service.ts`, `dto/` for request/response classes.
- Cross-cutting code lives in `common/` (decorators, exception filter, request logger, `ApiErrorDto`, `rate-limit/`, `crypto/`, `i18n/` for `Accept-Language` / `X-Country` / language labels, `subtitles/` for the dependency-free SRT→VTT converter), `config/` (zod env schema + `AppConfig`), `prisma/`, `redis/`, `openapi/`, `observability/` (Sentry).
- `src/generated/prisma/` is generated and git-ignored: never edit, run `npm run prisma:generate`.
- Not-yet-implemented endpoints throw `notImplemented('<ticket>')` (501) but ARE documented in OpenAPI v1 with real request/response DTOs and `@ApiNotImplementedResponse` (the Android mock is generated from them). Keep their DTOs stable; mark every stub with `// TODO <ticket>`.
- New env var = `env.schema.ts` + `AppConfig` getter + `.env.example` + README table + CI workflow env + `openapi-export.ts` fallbacks if it is required.

## HTTP conventions

- Protected by default: the global `JwtAuthGuard` requires a bearer token unless the handler/class has `@Public()`. Public routes still populate `req.user` when a valid token is sent. Read the user with `@CurrentUser()`.
- Back-office routes: class-level `@AdminRoute()` + `@UseGuards(AdminAuthGuard)` + `@ApiBearerAuth('admin')`, role restrictions with `@Roles('EDITOR', 'ADMIN')`, actor with `@CurrentAdmin()`. Admin JWTs use `ADMIN_JWT_SECRET` / `aud: admin`; never accept them in `JwtAuthGuard` or user JWTs in `AdminAuthGuard`. Contract: `docs/api/admin-contract-v1.md` (binding; any change goes through that file first).
- Every admin mutation records an `AuditService` entry (actor, action `<target>.<verb>`, old/new values of the changed fields, IP), inside the same `$transaction` as the write when there is one.
- Rate-limited routes declare `@RateLimit({ name, limit, windowSeconds, scope: 'ip' | 'email' })`; the guard answers 429 `RATE_LIMITED` and fails open when Redis is down.
- Webhooks (`/webhooks/*`) are `@Public()` and authenticated by signature over `req.rawBody` (app created with `rawBody: true`), never by JWT.
- Validate every input with class-validator DTOs (global `ValidationPipe`: whitelist + forbidNonWhitelisted + transform). Query DTOs need `@Type(() => Number)` for numbers. File uploads that must go through the API (subtitles only, 2 MB) use `FileInterceptor` with `limits` and a plain `UploadedSubtitleFile` interface; videos and posters never transit through the API (presigned PUT).
- Public catalog responses are cached by `CatalogCacheService` (`GET /home` 60 s per country+language, `GET /series/{id}` and `/episodes` 120 s per country, anonymous variant). Never put per-user data in a cached payload: compute `access`/`coinCost` and « Continuer à regarder » after the cache (`withAccess()`, `HomeService`). Any write that changes what the public sees must call `cache.invalidateSeries(seriesId)` (series patch/publish/archive, episode update/delete/reorder, `TranscodeService.markReady`, subtitles) or `cache.invalidateHome()` (home banners/rows). Services that invalidate take `CatalogCacheService` as a constructor dependency; pass a mock in unit specs.
- Viewer context comes from `CatalogService.viewerContext(userId, { country, acceptLanguage })`: `X-Country` header, else account country, else no territorial filter; language from `Accept-Language` restricted to `fr|en|es|pt` (default fr).
- Document every endpoint with `@ApiOperation`, response types and `ApiErrorDto` for errors. Run `npm run openapi:export` after changing the contract; CI fails if `docs/api/openapi.v1.json` is stale (`openapi.v0.1.json` is history, do not regenerate it). Bump `OPENAPI_VERSION` in `src/openapi/openapi.ts` on breaking changes.
- Errors: throw Nest `HttpException`s with `{ code: 'STABLE_CODE', message, details? }`; `AllExceptionsFilter` normalises everything to `ApiErrorDto`. Codes are SCREAMING_SNAKE_CASE and are the contract with the app; messages are English and not shown to users.
- Code, identifiers and commits in English; Swagger descriptions, README and user-facing text in French.

## Prisma rules

- Tables/columns are snake_case via `@@map`/`@map`; models and fields camelCase. IDs are `uuid(7)`. Timestamps are `Timestamptz(3)` with `createdAt`/`updatedAt`.
- Schema change = `npm run prisma:migrate -- --name <snake_case_name>` and commit `prisma/migrations/*`. Never edit a merged migration; check with `npm run prisma:reset` that migrations replay from scratch.
- Use `prisma.$transaction(async (tx) => …)` whenever two writes must be atomic (user + wallet, ledger + unlock, token rotation).
- Public catalog queries must go through `publishedSeriesWhere()` / `visibleEpisodeWhere()` (`catalog/catalog.where.ts`), and access decisions through `EntitlementService` + `computeAccess()`.
- Episode transcode status transitions go through `TranscodeService` (`submit`, `markProcessing`, `markReady`, `markFailed`), never by updating `transcodeStatus` directly elsewhere. Storage keys: `sources/{seriesId}/{episodeId}/{fileName}`, `hls/{episodeId}/…`, `posters/{uuid}/{fileName}`, `subtitles/{episodeId}/{language}.vtt` (stored as the relative key in `subtitles.file_url`); public URLs via `StorageService.publicUrl()` / `resolveMediaUrl()`.
- Home configuration lives in `home_banners` / `home_rows` (B-05); `GET /home` is built only from it (`HomeService`), never from hard-coded rows. `home_rows.titles` is JSON `{ fr, en?, es?, pt? }` with `fr` mandatory. Admin accounts: ADMIN-only routes, never let a request remove the last active ADMIN or the caller's own ADMIN role; `reset-totp` clears both `totp_secret` and `totp_enabled_at`. Never touch the seed account `admin@drama.local` TOTP in tests or scripts (create `e2e-*@drama.local` accounts and delete them, audit logs first).

## Ledger rule (non-negotiable)

Every coin movement is an append-only `coin_ledger` row (`amount` signed, `bucket`, `type`, unique `idempotencyKey`, `expiresAt` for bonus). `wallets.purchased_balance` / `bonus_balance` are projections updated in the same transaction as the ledger insert and must equal the sum of the ledger. No direct balance updates, no ledger UPDATE/DELETE (corrections are `ADJUSTMENT`/`REFUND` rows). Bonus coins are spent before purchased coins. The server is the only source of truth for balances, entitlements and prices.

## Tests

- Unit: `npm test` (Vitest, `src/**/*.spec.ts`, globals enabled). Mock Prisma/Redis/S3/ffmpeg with plain objects and `vi.fn()`; construct services directly (`new Service(prisma as never, …)`) rather than booting a Nest module. `FfmpegRunner` is the seam for the transcode pipeline.
- E2E: `npm run test:e2e` (`test/**/*.e2e-spec.ts`) needs the compose stack (PostgreSQL, Redis, MinIO) and `npm run prisma:deploy`. Create apps with `createNestApplication({ rawBody: true })`. Force `process.env.TRANSCODE_PROVIDER = 'webhook'` in e2e files so no ffmpeg job runs; the real pipeline is exercised by `npx tsx scripts/smoke-ingest.ts` against a running API. Clean up rows you create (series cascade episodes; delete audit logs of test actors before the accounts).
- Before handing over: `npm run lint && npm run build && npm test` must pass; run `npm run test:e2e` when you touched auth, admin, catalog, playback, transcode or the schema. ffmpeg 6+ must be installed for the smoke test.
