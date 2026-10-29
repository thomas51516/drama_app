# web/ — conventions for agents

Nuxt 3 workspace (npm workspaces): one base layer, several apps. Read `web/README.md` for the full picture.

- `layers/base` is the only place for shared code: Tailwind, PrimeVue (Aura), Pinia, i18n, `useApi()`, auth store, layouts, layout components, mocks, API types.
- `apps/admin` extends the layer and holds pages only (plus app-specific config). `apps/recharge` is a placeholder until Sprint 9.
- Import layer code from an app with the `#base/...` alias, never with `../../layers/...`.
- Every HTTP call goes through `useApi()` (or the typed wrappers `useCatalogueApi()`, `useSubtitlesApi()`, `useFeaturedApi()`, `useAdministrationApi()`); never call `$fetch` directly in pages or stores. Multipart uploads to the API (subtitles) pass a `FormData` body to `useApi().post()`. Types of the API live in `layers/base/types/api.ts` and must match `docs/api/admin-contract-v1.md` exactly (enum values are uppercase: `DRAFT`, `READY`, `ADMIN`...).
- User feedback: `useNotify()` for toasts (success/errors, `apiError(err)` for failed calls), `useConfirm()` for destructive actions. `useApi()` already handles 401 (redirect) and 403 (toast "Droits insuffisants"); do not toast those again.
- Media keys (`hlsKey`, thumbnails, `mock://assets/...`) are resolved with `useMediaUrl().resolve()`, never by concatenating URLs in templates.
- Video and poster uploads never go through the API: presign/upload-url then direct PUT with `utils/upload-transport.ts` (`xhrUploadTransport`, or `mockUploadTransport` when `api.isMock`). Bulk upload logic lives in `utils/upload-queue.ts` (pure, tested); keep UI components thin.
- Mock mode (`runtimeConfig.public.apiMock`) must keep working: add a `route(method, path, handler)` in `layers/base/mocks/index.ts` (stateful, path params with `:id`, contract error codes) and a fixture JSON for each new endpoint. Tests shorten `mockTiming` / `mockUploadTiming` and call `resetMockState()`.
- Pages are private by default (`middleware/auth.global.ts`); opt out with `definePageMeta({ public: true })`.
- UI strings are i18n keys (`layers/base/i18n/locales/fr.json` first, `en.json` second). Never hardcode French in templates.
- Back-office navigation comes from `layers/base/utils/modules.ts` (B-01 to B-13). Replace a `ComingSoon` route by adding a real page at the same path. Real pages so far: `/series`, `/episodes`, `/subtitles`, `/featured`, `/administration`.
- Role gating in pages: compute `canEdit` from `useAuthStore().user.role` (helpers in `utils/series-form.ts`), render `LayoutForbidden` for pages a role may not open (B-13 is ADMIN-only) and keep server errors as the source of truth (`notify.apiError`).
- Components that load data inside lazy tabs/dialogs must not `await useAsyncData` at top level (no Suspense boundary there): call it without `await` and drive the UI with `status`.
- Form logic stays in pure utils (`utils/featured.ts`, `utils/accounts.ts`, `utils/subtitles.ts`, `utils/audit-diff.ts`) returning i18n keys as error codes; components only translate and display.
- Code, identifiers and comments in English; UI and READMEs in French.
- Before handing over: `npm run lint && npm run typecheck && npm run test && npm run build:admin` from `web/`.
- Tests run in the Nuxt runtime (`environment: 'nuxt'`, rootDir `apps/admin`, mock API forced on). Put layer tests in `layers/base/tests`, app tests in `apps/<app>/tests`. Prefer testing pure utils (`series-form`, `upload-queue`, `polling`) and the mock flow over mounting PrimeVue-heavy pages.
- Do not edit generated files (`.nuxt/`, `eslint-typegen.d.ts`). ESLint config is the single `web/eslint.config.mjs`.
