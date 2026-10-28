# web/ — conventions for agents

Nuxt 3 workspace (npm workspaces): one base layer, several apps. Read `web/README.md` for the full picture.

- `layers/base` is the only place for shared code: Tailwind, PrimeVue (Aura), Pinia, i18n, `useApi()`, auth store, layouts, layout components, mocks, API types.
- `apps/admin` extends the layer and holds pages only (plus app-specific config). `apps/recharge` is a placeholder until Sprint 9.
- Import layer code from an app with the `#base/...` alias, never with `../../layers/...`.
- Every HTTP call goes through `useApi()`; never call `$fetch` directly in pages or stores. Types of the API live in `layers/base/types/api.ts`.
- Mock mode (`runtimeConfig.public.apiMock`) must keep working: add a handler in `layers/base/mocks/index.ts` and a fixture JSON for each new endpoint.
- Pages are private by default (`middleware/auth.global.ts`); opt out with `definePageMeta({ public: true })`.
- UI strings are i18n keys (`layers/base/i18n/locales/fr.json` first, `en.json` second). Never hardcode French in templates.
- Back-office navigation comes from `layers/base/utils/modules.ts` (B-01 to B-13). Replace a `ComingSoon` route by adding a real page at the same path.
- Code, identifiers and comments in English; UI and READMEs in French.
- Before handing over: `npm run lint && npm run typecheck && npm run test && npm run build:admin` from `web/`.
- Tests run in the Nuxt runtime (`environment: 'nuxt'`, rootDir `apps/admin`, mock API forced on). Put layer tests in `layers/base/tests`, app tests in `apps/<app>/tests`.
- Do not edit generated files (`.nuxt/`, `eslint-typegen.d.ts`). ESLint config is the single `web/eslint.config.mjs`.
