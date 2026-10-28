# backend/ — conventions for agents

NestJS 12 (ESM, `"type": "module"`, imports end with `.js`), TypeScript strict, Prisma 7 + `@prisma/adapter-pg`, Vitest, ESLint (typed) + Prettier. Functional spec: `../docs/Cahier des charges…md` §8; tickets: `../docs/Backlog…md`.

## Layout

- One folder per business module (spec §8.2): `auth`, `catalog`, `playback`, `unlock`, `wallet`, `billing`, `rewards`, `users`, `admin`, plus `health`. Each has `<name>.module.ts`, `<name>.controller.ts`, `<name>.service.ts`, `dto/` for request/response classes.
- Cross-cutting code lives in `common/` (decorators, exception filter, request logger, `ApiErrorDto`), `config/` (zod env schema + `AppConfig`), `prisma/`, `redis/`, `openapi/`.
- `src/generated/prisma/` is generated and git-ignored: never edit, run `npm run prisma:generate`.
- Not-yet-implemented endpoints throw `notImplemented('<ticket>')` (501) and their controllers carry `@ApiExcludeController()` until their sprint. Mark every stub with `// TODO <ticket>`.

## HTTP conventions

- Protected by default: the global `JwtAuthGuard` requires a bearer token unless the handler/class has `@Public()`. Public routes still populate `req.user` when a valid token is sent. Read the user with `@CurrentUser()`.
- Validate every input with class-validator DTOs (global `ValidationPipe`: whitelist + forbidNonWhitelisted + transform). Query DTOs need `@Type(() => Number)` for numbers.
- Document every public endpoint with `@ApiOperation`, response types and `ApiErrorDto` for errors. Run `npm run openapi:export` after changing the contract; CI fails if `docs/api/openapi.v0.1.json` is stale. Bump `OPENAPI_VERSION` in `src/openapi/openapi.ts` on breaking changes.
- Errors: throw Nest `HttpException`s with `{ code: 'STABLE_CODE', message, details? }`; `AllExceptionsFilter` normalises everything to `ApiErrorDto`. Codes are SCREAMING_SNAKE_CASE and are the contract with the app; messages are English and not shown to users.
- Code, identifiers and commits in English; Swagger descriptions, README and user-facing text in French.

## Prisma rules

- Tables/columns are snake_case via `@@map`/`@map`; models and fields camelCase. IDs are `uuid(7)`. Timestamps are `Timestamptz(3)` with `createdAt`/`updatedAt`.
- Schema change = `npm run prisma:migrate -- --name <snake_case_name>` and commit `prisma/migrations/*`. Never edit a merged migration; check with `npm run prisma:reset` that migrations replay from scratch.
- Use `prisma.$transaction(async (tx) => …)` whenever two writes must be atomic (user + wallet, ledger + unlock, token rotation).
- Public catalog queries must go through `publishedSeriesWhere()` / `visibleEpisodeWhere()` (`catalog/catalog.where.ts`), and access decisions through `EntitlementService` + `computeAccess()`.

## Ledger rule (non-negotiable)

Every coin movement is an append-only `coin_ledger` row (`amount` signed, `bucket`, `type`, unique `idempotencyKey`, `expiresAt` for bonus). `wallets.purchased_balance` / `bonus_balance` are projections updated in the same transaction as the ledger insert and must equal the sum of the ledger. No direct balance updates, no ledger UPDATE/DELETE (corrections are `ADJUSTMENT`/`REFUND` rows). Bonus coins are spent before purchased coins. The server is the only source of truth for balances, entitlements and prices.

## Tests

- Unit: `npm test` (Vitest, `src/**/*.spec.ts`, globals enabled). Mock Prisma/Redis with plain objects and `vi.fn()`; construct services directly (`new Service(prisma as never, …)`) rather than booting a Nest module.
- E2E: `npm run test:e2e` (`test/**/*.e2e-spec.ts`) needs the compose stack and `npm run prisma:deploy`. Clean up rows you create.
- Before handing over: `npm run lint && npm run build && npm test` must pass; run `npm run test:e2e` when you touched auth, catalog, playback or the schema.
