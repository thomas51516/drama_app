# DRAMA — web (back-office et site de recharge)

Espace de travail npm (workspaces) regroupant les applications web du projet, conformément au
cahier des charges (§11) : **une base Nuxt 3 commune, deux applications distinctes**.

| Dossier         | Rôle                                                                                                                                                                                                            | Tickets                     |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `layers/base`   | Couche Nuxt partagée : Tailwind CSS, PrimeVue (thème Aura), Pinia, i18n (FR par défaut), client API typé `useApi()`, store d'authentification, layouts et composants de mise en page, fixtures de démonstration | S03-WEB-01                  |
| `apps/admin`    | Back-office (comptes internes, JWT + TOTP obligatoire) : catalogue B-01, épisodes et upload B-02                                                                                                                | S03-WEB-01 à 03, S04-WEB-01 |
| `apps/recharge` | Site de recharge mobile money — emplacement réservé, créé au Sprint 9                                                                                                                                           | S09-WEB-*                   |

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

En mode mock, se connecter avec `admin@drama.local` / `Admin1234!` puis le code TOTP `123456`
(autres comptes de démonstration : `editor@`, `money@` — première connexion avec enrôlement TOTP —,
`support@drama.local`, même mot de passe et même code).

## Variables d'environnement

Lues à l'exécution par la configuration runtime de Nuxt (préfixe `NUXT_PUBLIC_`), voir `.env.example`.

| Variable                   | Défaut                                 | Rôle                                                                                                                                         |
| -------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `NUXT_PUBLIC_API_BASE`     | `http://localhost:3000`                | URL de base de l'API NestJS                                                                                                                  |
| `NUXT_PUBLIC_API_MOCK`     | `true` en `nuxt dev`, `false` en build | `true` : `useApi()` répond avec les fixtures de `layers/base/mocks/`, sans réseau                                                            |
| `NUXT_PUBLIC_CDN_BASE_URL` | `http://localhost:9000/drama-media`    | Base publique des clés média (`hls/{episodeId}/master.m3u8`, vignettes) : bucket MinIO en dev, CDN en production ; utilisée par l'aperçu HLS |

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
│   ├── composables/         # useApi, useCatalogueApi (B-01/B-02 typés), useNotify (toasts),
│   │                        # useMediaUrl (clés → URL CDN), useEpisodeUploads, usePosterUpload
│   ├── stores/auth.ts       # login(), verifyTotp(), fetchMe(), logout()
│   ├── middleware/auth.global.ts
│   ├── layouts/             # default (shell + Toast + ConfirmDialog), auth (page de connexion)
│   ├── components/layout/   # AppSidebar, AppTopbar, PageHeader (fil d'Ariane), ComingSoon
│   ├── components/catalogue/# SeriesForm, PosterUpload, TerritoriesInput, SeriesStatusTag
│   ├── components/episodes/ # UploadDropZone, UploadQueuePanel, HlsPlayerDialog, EpisodeStatusTag
│   ├── i18n/locales/        # fr.json (référence), en.json
│   ├── mocks/               # index.ts (API simulée avec état), assets.ts, fixtures JSON
│   ├── types/api.ts         # contrats de l'API admin (= docs/api/admin-contract-v1.md)
│   ├── utils/               # ApiError, upload-queue, upload-transport, polling, series-form,
│   │                        # countries, format, episode-files, registre des modules B-01…B-13
│   └── tests/
└── apps/
    ├── admin/
    │   ├── nuxt.config.ts   # extends: ['../../layers/base'], ssr: false
    │   ├── app.vue          # NuxtErrorBoundary autour des pages
    │   ├── error.vue        # erreurs fatales (404 de route…)
    │   ├── pages/           # login, index (→ /series), series/{index,new,[id]/index,[id]/episodes},
    │   │                    # episodes/index (choix de la série), [module] (« Module à venir »)
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

Les contrats sont ceux de `docs/api/admin-contract-v1.md`, retranscrits dans `layers/base/types/api.ts`.

## Catalogue et épisodes (S03-WEB-03, S04-WEB-01)

### Séries (B-01)

- `/series` : liste paginée (20 par page, `GET /admin/series?page&pageSize&status&q`), filtres statut et
  recherche (dans l'URL), étiquettes de statut, accès à l'édition et aux épisodes.
- `/series/new` et `/series/:id` : formulaire commun `CatalogueSeriesForm` — titre, synopsis, genres
  (liste fixe), tags, langue (fr/en/es/pt), classification d'âge, épisodes gratuits, coût par épisode,
  territoires (codes ISO alpha-2 avec suggestions et raccourci « Francophonie »), affiches verticale et
  horizontale (`POST /admin/uploads/presign` puis `PUT` direct vers le stockage, aperçu immédiat).
- Validation côté client dans `utils/series-form.ts` (messages français `validation.*`) ; le `PATCH`
  n'envoie que les champs modifiés.
- Rôles : les champs de monétisation sont désactivés sauf pour `MONETIZATION` et `ADMIN` ; les autres
  champs sont désactivés pour `MONETIZATION` et `SUPPORT` (formulaire en lecture seule pour `SUPPORT`).
- Publier / archiver avec confirmation ; un `409` à la publication (aucun épisode READY) affiche le
  message dédié.

### Épisodes et upload (B-02)

- `/series/:id/episodes` : table triée par numéro (statut, vignette, durée, date de publication),
  renommage en ligne, suppression avec confirmation, relance du transcodage sur `FAILED`,
  réordonnancement par glisser-déposer (`PUT /admin/series/:id/episodes/order`), aperçu HLS (hls.js,
  chargé à la demande) des épisodes `READY` à partir de `NUXT_PUBLIC_CDN_BASE_URL` + `hlsKey`.
- « Ajouter des épisodes » : zone de dépôt multi-fichiers (MP4/MOV). Pour chaque fichier :
  `POST /admin/series/:id/episodes` (titre = nom du fichier sans extension) → `POST /admin/episodes/:id/upload-url`
  → `PUT` XHR direct vers le stockage avec progression → `POST /admin/episodes/:id/uploaded`.
  Orchestrateur `utils/upload-queue.ts` : 3 envois simultanés au plus, progression par fichier et
  globale, relance (réutilise l'épisode déjà créé), annulation, avertissement avant de quitter la page.
- Tant qu'un épisode est `PROCESSING` (ou `UPLOADED`), la liste est rechargée toutes les 5 s
  (`utils/polling.ts`).
- **Limite actuelle : un seul `PUT`, 2 Go maximum par fichier** (limite du contrat). La reprise
  multipart / tus viendra dans un ticket ultérieur ; le transport est isolé dans
  `utils/upload-transport.ts` pour être remplacé sans toucher à l'orchestrateur.

### Mode mock de bout en bout

`layers/base/mocks/index.ts` implémente le contrat avec un état en mémoire (réinitialisé au
rechargement) : filtres, pagination, création/édition, rôles (403), publication refusée (409),
épisodes (création, renommage, ordre, suppression). Les URL d'upload sont des `mock://upload/...`
traitées par `mockUploadTransport` (progression simulée, fichier conservé pour l'aperçu des affiches) ;
`POST /uploaded` fait passer l'épisode `UPLOADED` → `PROCESSING` (1,5 s) → `READY` (4 s), avec un
manifeste HLS pointant vers les échantillons `hls/samples/epN/` de `infra/media-samples` dans MinIO,
donc l'aperçu fonctionne réellement si MinIO tourne. Astuces de démonstration : un fichier dont le nom
contient `upload-error` échoue à l'envoi (bouton Relancer), un nom contenant `fail` finit en `FAILED`
(bouton Relancer le transcodage).

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
