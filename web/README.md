# DRAMA — web (back-office et site de recharge)

Espace de travail npm (workspaces) regroupant les applications web du projet, conformément au
cahier des charges (§11) : **une base Nuxt 3 commune, deux applications distinctes**.

| Dossier         | Rôle                                                                                                                                                                                                            | Tickets                |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `layers/base`   | Couche Nuxt partagée : Tailwind CSS, PrimeVue (thème Aura), Pinia, i18n (FR par défaut), client API typé `useApi()`, store d'authentification, layouts et composants de mise en page, fixtures de démonstration | S03-WEB-01             |
| `apps/admin`    | Back-office (comptes internes, JWT + TOTP obligatoire)                                                                                                                                                          | S03-WEB-01, S03-WEB-02 |
| `apps/recharge` | Site de recharge mobile money — emplacement réservé, créé au Sprint 9                                                                                                                                           | S09-WEB-*              |

## Versions retenues

| Brique       | Version                                                                                                                 | Remarque                                                                                              |
| ------------ | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Node / npm   | 24 / 11                                                                                                                 | pas de pnpm                                                                                           |
| Nuxt         | 3.21.x                                                                                                                  | dernière 3.x, comme le cahier des charges ; Nuxt 4 est sorti mais la migration n'est pas au périmètre |
| Vue / Pinia  | 3.5 / 4.1 (`@pinia/nuxt` 1.x)                                                                                           |                                                                                                       |
| PrimeVue     | 4.5.x + `@primeuix/themes` (préréglage **Aura**, mode stylé)                                                            | PrimeVue 5 (juillet 2026) introduit un gestionnaire de licence : à évaluer séparément avant migration |
| Tailwind CSS | 4.x via `@tailwindcss/vite` + plugin `tailwindcss-primeui`                                                              | les couleurs `primary-*`, `surface-*` suivent le thème PrimeVue                                       |
| i18n         | `@nuxtjs/i18n` 10.x (vue-i18n 11), stratégie `no_prefix`, FR par défaut, EN en secours                                  |                                                                                                       |
| Qualité      | TypeScript strict, ESLint 10 (`@nuxt/eslint`) + Prettier, Vitest 5 + `@nuxt/test-utils` (environnement Nuxt, happy-dom) |                                                                                                       |

## Commandes

Toutes les commandes se lancent depuis `web/`.

```bash
npm install            # installe tout l'espace de travail et génère les types (.nuxt) de l'app admin
npm run dev:admin      # back-office en développement : http://localhost:3100 (mode mock activé)
npm run build:admin    # build de production dans apps/admin/.output
npm run preview:admin  # sert le build de production
npm run lint           # ESLint + vérification Prettier (layers + apps)
npm run lint:fix       # corrige ESLint et reformate
npm run typecheck      # vue-tsc via `nuxt typecheck`
npm run test           # Vitest (une passe) ; npm run test:watch pour le mode interactif
```

En mode mock, se connecter avec `admin@drama.local` / `Admin1234!` puis le code TOTP `123456`.

## Variables d'environnement

Lues à l'exécution par la configuration runtime de Nuxt (préfixe `NUXT_PUBLIC_`), voir `.env.example`.

| Variable               | Défaut                                 | Rôle                                                                              |
| ---------------------- | -------------------------------------- | --------------------------------------------------------------------------------- |
| `NUXT_PUBLIC_API_BASE` | `http://localhost:3000`                | URL de base de l'API NestJS                                                       |
| `NUXT_PUBLIC_API_MOCK` | `true` en `nuxt dev`, `false` en build | `true` : `useApi()` répond avec les fixtures de `layers/base/mocks/`, sans réseau |

Aucun secret n'est nécessaire côté web : le back-office ne possède que le JWT de l'utilisateur connecté.

## Structure

```
web/
├── package.json             # racine des workspaces, scripts dev:admin / build:admin / lint / typecheck / test
├── eslint.config.mjs        # config ESLint unique (enveloppe celle générée par @nuxt/eslint)
├── vitest.config.ts         # tests dans le runtime Nuxt de l'app admin
├── layers/base/
│   ├── nuxt.config.ts       # modules, Tailwind, PrimeVue, i18n, runtimeConfig, alias #base
│   ├── assets/css/main.css  # @import "tailwindcss" + plugin PrimeUI
│   ├── composables/useApi.ts
│   ├── stores/auth.ts       # login(), verifyTotp(), fetchMe(), logout()
│   ├── middleware/auth.global.ts
│   ├── layouts/             # default (shell authentifié), auth (page de connexion)
│   ├── components/layout/   # AppSidebar, AppTopbar, PageHeader, ComingSoon
│   ├── i18n/locales/        # fr.json (référence), en.json
│   ├── mocks/               # index.ts (routes simulées) + fixtures JSON
│   ├── types/api.ts         # contrats de l'API admin
│   ├── utils/               # ApiError, registre des modules B-01…B-13
│   └── tests/
└── apps/
    ├── admin/
    │   ├── nuxt.config.ts   # extends: ['../../layers/base'], ssr: false
    │   ├── app.vue
    │   ├── pages/           # login, index (→ /series), series/index, [module] (« Module à venir »)
    │   └── tests/
    └── recharge/README.md
```

## Authentification (S03-WEB-02)

1. `/login` : e-mail + mot de passe → `POST /admin/auth/login`. La réponse ne contient jamais de session,
   seulement un défi (`totp_required`, ou `totp_setup_required` à la première connexion avec la clé à
   enrôler).
2. Code à 6 chiffres → `POST /admin/auth/totp/verify` → JWT + profil.
3. Le JWT est conservé dans le cookie `drama_admin_token` (`SameSite=Strict`, `Secure` hors dev, 8 h).
   **Compromis** : un cookie `httpOnly` est impossible à poser depuis une SPA qui doit envoyer l'en-tête
   `Authorization` ; on retient donc un cookie non-httpOnly plutôt que `localStorage` (jamais envoyé en
   cross-site, durée courte). Le risque résiduel XSS est couvert par la CSP et la durée de vie du jeton
   côté backend (S03-BE-04). À revoir si le backend propose une session par cookie.
4. `middleware/auth.global.ts` protège toutes les pages ; une page publique déclare
   `definePageMeta({ public: true })`. Toute réponse 401 hors flux de connexion vide la session et renvoie
   vers `/login?redirect=…`.

Les endpoints ci-dessus n'existent pas encore côté backend : les contrats sont dans
`layers/base/types/api.ts` et seront alignés sur `docs/api` dès leur publication.

## Ajouter une application sur la couche de base

1. Créer `apps/<nom>/package.json` (nom `@drama/<nom>`, dépendance `"@drama/web-base": "0.1.0"`, scripts
   `prepare: nuxt prepare`, `dev`, `build`, `typecheck: nuxt typecheck`).
2. Créer `apps/<nom>/nuxt.config.ts` :
   ```ts
   export default defineNuxtConfig({ extends: ['../../layers/base'] })
   ```
   puis `app.vue`, `pages/`, et `tsconfig.json` (`{ "extends": "./.nuxt/tsconfig.json" }`).
3. Ajouter les scripts `dev:<nom>` / `build:<nom>` à `web/package.json` et, si besoin, un second
   `defineVitestConfig` (ou un projet Vitest) pointant `rootDir` sur la nouvelle app.
4. `npm install` depuis `web/` : le workspace est détecté automatiquement (`apps/*`).

Tout ce qui est commun (client API, thème, i18n, composants de layout) reste dans `layers/base` ;
une app ne contient que ses pages et sa configuration propre.

## Ajouter un endpoint

1. Déclarer les types dans `layers/base/types/api.ts`.
2. Ajouter un gestionnaire dans `layers/base/mocks/index.ts` (clé `"GET /admin/..."`) et une fixture JSON.
3. Consommer via `useApi().get<T>('/admin/...')` dans une page ou un store, idéalement avec `useAsyncData`.
