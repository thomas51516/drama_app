# DRAMA — web (back-office et site de recharge)

Espace de travail npm (workspaces) regroupant les applications web du projet, conformément au
cahier des charges (§11) : **une base Nuxt 3 commune, deux applications distinctes**.

| Dossier         | Rôle                                                                                                                                                                                                                                                                                  | Tickets                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `layers/base`   | Couche Nuxt partagée : Tailwind CSS, PrimeVue (thème Aura), Pinia, i18n (FR par défaut), client API typé `useApi()`, store d'authentification, layouts et composants de mise en page, fixtures de démonstration                                                                       | S03-WEB-01                                                                              |
| `apps/admin`    | Back-office (comptes internes, JWT + TOTP obligatoire, appareil de confiance) : catalogue B-01, épisodes et upload B-02, sous-titres B-03, mise en avant B-05, monétisation B-06, récompenses B-08, utilisateurs B-09, notifications B-10, centre d'aide B-03bis, administration B-13 | S03-WEB-01 à 03, S04-WEB-01 à 03, S05-WEB-01/02, B-13+, B-10, B-03bis, B-06, B-08, B-09 |
| `apps/recharge` | Site de recharge mobile money (SSR, mobile d'abord, FR/EN/ES/PT, < 300 Ko gzip par page) : connexion par le même compte (OTP, e-mail, Google), packs avec offres, paiement, historique, compte                                                                                        | S09-WEB-01/02                                                                           |

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
npm run dev:recharge      # site de recharge en développement : http://localhost:3200 (mode mock activé)
npm run build:recharge    # build SSR de production dans apps/recharge/.output
npm run preview:recharge  # sert le build de production
npm run lint           # ESLint + vérification Prettier (layers + apps)
npm run lint:fix       # corrige ESLint et reformate
npm run typecheck      # vue-tsc via `nuxt typecheck`
npm run test           # Vitest (une passe) ; npm run test:watch pour le mode interactif
```

En mode mock, se connecter avec `admin@drama.local` / `Admin1234!` puis le code TOTP `123456`
(autres comptes de démonstration : `editor@`, `money@` — première connexion avec enrôlement TOTP —,
`support@drama.local`, même mot de passe et même code).

Site de recharge en mode mock : compte de démonstration affiché sur `/login` (e-mail + mot de
passe, ou téléphone avec le code OTP affiché à l'écran), paiement simulé par une page de
l'application (`/mock-payment/{orderId}`, boutons Payer / Échouer) qui reproduit la page que l'API
sert réellement en développement (`/topup/fake/{orderId}`).

## Variables d'environnement

Lues à l'exécution par la configuration runtime de Nuxt (préfixe `NUXT_PUBLIC_`), voir `.env.example`.

| Variable                       | Défaut                                 | Rôle                                                                                                                                                                                    |
| ------------------------------ | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NUXT_PUBLIC_API_BASE`         | `http://localhost:3000`                | URL de base de l'API NestJS                                                                                                                                                             |
| `NUXT_PUBLIC_API_MOCK`         | `true` en `nuxt dev`, `false` en build | `true` : `useApi()` répond avec les fixtures de `layers/base/mocks/`, sans réseau                                                                                                       |
| `NUXT_PUBLIC_CDN_BASE_URL`     | `http://localhost:9000/drama-media`    | Base publique des clés média (`hls/{episodeId}/master.m3u8`, vignettes) : bucket MinIO en dev, CDN en production ; utilisée par l'aperçu HLS                                            |
| `NUXT_BUILD_DIR`               | `apps/admin/.nuxt`                     | Dossier de build Nuxt (option de build, pas de runtime). À pointer ailleurs pour lancer un `nuxt build` ou un second `nuxt dev` à côté d'un serveur de dev déjà lancé sur le même dépôt |
| `NUXT_PUBLIC_GOOGLE_CLIENT_ID` | vide (bouton masqué)                   | Site de recharge uniquement : identifiant client OAuth Google affiché par le bouton « Continuer avec Google » sur `/login`. Doit aussi figurer dans `GOOGLE_CLIENT_IDS` côté backend.   |

Aucun secret n'est nécessaire côté web : le back-office ne possède que le JWT de l'utilisateur connecté,
et le site de recharge que le jeton de l'utilisateur final (tokens non httpOnly, même compromis que
le back-office, voir « Authentification » et « Site de recharge » ci-dessous).

## Structure

```
web/
├── package.json             # racine des workspaces, scripts dev:admin / build:admin / lint / typecheck / test
├── eslint.config.mjs        # config ESLint unique (enveloppe celle générée par @nuxt/eslint)
├── vitest.config.ts         # tests dans le runtime Nuxt de l'app admin
├── layers/base/
│   ├── nuxt.config.ts       # modules, Tailwind, PrimeVue, i18n, runtimeConfig, alias #base
│   ├── assets/css/main.css  # @import "tailwindcss" + plugin PrimeUI
│   ├── composables/         # useApi (client HTTP, session interchangeable), useCatalogueApi (B-01/B-02),
│   │                        # useSubtitlesApi (B-03), useFeaturedApi (B-05), useScheduleApi (B-04),
│   │                        # useStatsApi (B-11), useAdministrationApi (B-13), useAccountApi (appareils de
│   │                        # confiance), useCampaignsApi (B-10), useHelpCenterApi (FAQ, tickets),
│   │                        # useMonetizationApi (B-06, B-08 check-in + tâches), useOffersApi (B-07),
│   │                        # useTopupApi (B-11 réconciliation + routes publiques du site de recharge),
│   │                        # useUsersApi (B-09), useRechargePrefs (pays/langue, site de recharge),
│   │                        # useNotify (toasts), useMediaUrl, useEpisodeUploads, usePosterUpload
│   ├── stores/auth.ts       # session admin : login() (jeton d'appareil), verifyTotp(code, rememberDevice),
│   │                        # fetchMe(), logout(), forgetDevice() ; support-inbox.ts (badge des tickets
│   │                        # ouverts) ; recharge-session.ts (session utilisateur final du site de recharge,
│   │                        # OTP/e-mail/Google, rotation du refresh token) ; topup-orders.ts (mémorise les
│   │                        # commandes créées par l'onglet, sessionStorage, pour la page de paiement)
│   ├── middleware/auth.global.ts  # back-office (toutes les pages privées par défaut)
│   ├── layouts/             # default (shell + Toast + ConfirmDialog), auth (page de connexion)
│   ├── components/layout/   # AppSidebar, AppTopbar, PageHeader (fil d'Ariane), ComingSoon, Forbidden
│   ├── components/catalogue/# SeriesForm, PosterUpload, TerritoriesInput, SeriesStatusTag
│   ├── components/episodes/ # UploadDropZone, UploadQueuePanel, HlsPlayerDialog (+ pistes <track>),
│   │                        # EpisodeStatusTag, SubtitlesPanel, SeriesPicker, PublicationTag,
│   │                        # PublishDateDialog, DailyReleaseDialog (B-04)
│   ├── components/schedule/ # MonthCalendar, AgendaList (B-04)
│   ├── components/dashboard/# StatTile, TopSeriesChart (B-11, Chart.js via PrimeVue Chart)
│   ├── components/featured/ # BannersPanel, RowsPanel, BannerDialog, RowDialog, SeriesPicker,
│   │                        # SeriesListEditor, HomePreview
│   ├── components/administration/ # AccountsPanel, AccountCreateDialog, AccountEditDialog,
│   │                        # PasswordResetDialog, SecretRevealDialog, AuditLogPanel, AuditDiff
│   ├── components/account/  # TrustedDevicesPanel (B-13+)
│   ├── components/campaigns/# CampaignDialog, CampaignDetailDrawer, CampaignStatusTag (B-10)
│   ├── components/help-center/ # FaqPanel, FaqEntryDialog, FaqPreview, SupportInbox (B-03bis)
│   ├── components/monetization/ # SettingsPanel, PacksPanel, PackDialog, VipPlansPanel, VipPlanDialog,
│   │                        # PricesEditor (prix par devise, complétion depuis le F CFA), ShopSimulator (B-06)
│   ├── components/rewards/  # CheckinScaleEditor, TasksPanel, TaskDialog (B-08)
│   ├── components/offers/   # WelcomeOfferCard, LimitedOffersPanel, LimitedOfferDialog, PromoCodesPanel,
│   │                        # PromoCodeDialog, RedemptionsDrawer, PackPicker, OfferStateTag (B-07)
│   ├── components/recharge/ # CountrySelect, LanguageSelect, PackCard, OrderStatusTag (site de recharge)
│   ├── components/users/    # ProfileCard, WalletCard, SubscriptionCard, HistoryTabs,
│   │                        # CoinAdjustmentDialog, BlockUserDialog (B-09)
│   ├── i18n/locales/        # fr.json (référence), en.json
│   ├── mocks/               # index.ts (API simulée avec état), assets.ts, fixtures JSON (stats, campaigns,
│   │                        # faq, tickets, monetization, users…)
│   ├── types/api.ts         # contrats de l'API : docs/api/admin-contract-v1.md + section back-office de
│   │                        # public-contract-v1.2.md + contract-v1.3-sprint5.md + contract-v1.4-sprint6.md
│   │                        # + contract-v1.5-sprint7.md (tâches B-08, offres/promos B-07, recharge/
│   │                        # réconciliation B-11) + les schémas publics d'openapi.v1.json que réutilise le
│   │                        # site de recharge (AuthSessionDto, ShopDto, WalletDto…)
│   ├── utils/               # ApiError, upload-queue, upload-transport, polling, series-form,
│   │                        # subtitles, featured, accounts, audit-diff, schedule (fuseau, calendrier,
│   │                        # sortie quotidienne), stats (tuiles, taux), markdown (aide), countries,
│   │                        # format, episode-files, campaigns (B-10), help-center (FAQ, tickets),
│   │                        # monetization (devises, prix, simulateur, formulaires B-06), rewards (barème
│   │                        # B-08 + tâches M-41), offers (offre de bienvenue, offres limitées, codes promo
│   │                        # + générateur, B-07), reconciliation (compteurs, CSV, B-11), topup (pays/devises,
│   │                        # machine à états de la commande, téléphone/OTP/e-mail, site de recharge),
│   │                        # users (ajustement de pièces, erreurs 4xx B-09), auth-errors (DEF-005),
│   │                        # registre des modules B-01…B-13 (+ B-03bis, rôles, badge, sous-pages)
│   └── tests/
├── docs/guide-back-office.md # guide v1 de l'équipe éditoriale (S06-WEB-02, étendu B-07/Tâches/Réconciliation
│                              # au sprint 7), rendu sur /help
└── apps/
    ├── admin/
    │   ├── nuxt.config.ts   # extends: ['../../layers/base'], ssr: false
    │   ├── app.vue          # NuxtErrorBoundary autour des pages
    │   ├── error.vue        # erreurs fatales (404 de route…)
    │   ├── pages/           # login, index (→ /series), series/{index,new,[id]/index,[id]/episodes},
    │   │                    # episodes/index et subtitles/index (choix de la série), schedule (B-04),
    │   │                    # featured (B-05), monetization (B-06), offers (B-07), rewards (B-08),
    │   │                    # users (B-09), campaigns (B-10), help-center (B-03bis), dashboard (B-11),
    │   │                    # topup-reconciliation (B-11, sous le menu Tableaux de bord),
    │   │                    # administration (B-13), account (Mon compte), help (guide),
    │   │                    # [module] (« Module à venir »)
    │   └── tests/
    └── recharge/            # site de recharge mobile money (SSR, S09-WEB-01/02)
        ├── nuxt.config.ts   # extends: ['../../layers/base'], ssr: true
        ├── app.vue          # langue depuis le cookie drama_lang (FR par défaut)
        ├── plugins/api-session.ts   # branche useApi() sur la session utilisateur final (recharge-session.ts)
        ├── middleware/auth.global.ts # seules /pay, /history, /account, /mock-payment exigent une session
        ├── layouts/default.vue # en-tête compact, navigation basse sur mobile, pied de page légal
        └── pages/           # index (accueil), login (téléphone+OTP ou e-mail+mot de passe, bouton Google
                              # masqué sans NUXT_PUBLIC_GOOGLE_CLIENT_ID), packs, pay/[orderId], history,
                              # account, legal/cgv, legal/confidentialite, mock-payment/[orderId] (mode mock)
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

### Appareil de confiance (B-13+, contrat v1.3)

- Sur l'écran du code, la case **« Se souvenir de cet appareil pendant 30 jours »** (décochée par
  défaut) envoie `rememberDevice: true` à `POST /admin/auth/totp/verify` ; le `deviceToken` reçu est
  conservé dans le cookie `drama_admin_device` (`SameSite=Strict`, `Secure` hors `nuxt dev`, 30 jours).
- `POST /admin/auth/login` reçoit ce `deviceToken` ; si le serveur répond `status: "ok"`, le store
  ouvre la session directement (`login()` renvoie `'done'`) et la page de connexion saute l'étape du
  code. Un jeton invalide est ignoré par le serveur : le flux TOTP habituel reprend, le cookie n'est
  pas touché (il peut appartenir à un autre compte sur le même navigateur).
- **Déconnexion et 401 (dont `ADMIN_TOKEN_REVOKED`) ne suppriment pas le cookie d'appareil** : la
  déconnexion n'est pas une révocation. Seul `forgetDevice()` le retire.
- `/account` (« Mon compte », menu utilisateur de la barre du haut) liste `GET /admin/auth/devices`
  (étiquette, dates, expiration, étiquette « Cet appareil » quand l'API renvoie `current: true`),
  **Révoquer** (`DELETE /admin/auth/devices/{id}`) et **Révoquer cet appareil** (révoque l'appareil
  courant si l'API l'identifie, puis vide le cookie). Administration → Comptes propose
  `POST /admin/accounts/{id}/revoke-devices` ; la réinitialisation TOTP révoque aussi tout.
- Mock : jetons aléatoires liés au compte, 30 jours, `current` calculé, réinitialisation TOTP et
  `revoke-devices` purgent la liste. Depuis le contrat v1.4, `current` est toujours renvoyé par
  l'API : le type `TrustedDevice.current` est obligatoire et « Révoquer cet appareil » s'appuie dessus.

### Messages de connexion (DEF-005)

`utils/auth-errors.ts` (`loginErrorKey()`, testé) traduit chaque échec de connexion : à l'étape du
code, le bouton **Vérifier** reste inactif tant que 6 chiffres ne sont pas saisis, la touche Entrée
sur un code incomplet affiche « Saisissez les 6 chiffres du code », `INVALID_TOTP_CODE` (401) donne
« Code incorrect ou expiré », un 400 de validation « Saisissez les 6 chiffres », un défi expiré
« La connexion a expiré ». À l'étape du mot de passe, 401 et 400 (mot de passe trop court) donnent
« Identifiants incorrects », 429 « Trop de tentatives », `ACCOUNT_DISABLED` « compte désactivé ».

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

### Sous-titres (S04-WEB-03, B-03)

- Sur `/series/:id/episodes`, chaque épisode `READY` a une action « Sous-titres » qui ouvre un panneau
  latéral : liste par langue, ajout d'un fichier `.srt` ou `.vtt` (2 Mo max) avec choix de la langue
  (fr/en/es/pt ou autre code ISO 639-1), remplacement (même langue = remplacement côté serveur),
  suppression avec confirmation. L'envoi est un `multipart/form-data` (`file`, `language`) vers
  `POST /admin/episodes/:id/subtitles` ; le serveur convertit le SRT en VTT.
- Aperçu synchronisé : le lecteur HLS charge les sous-titres de l'épisode comme pistes `<track>` et
  propose un sélecteur de langue (ou « Sans sous-titres ») pour vérifier le calage.
- Entrée « Sous-titres » de la barre latérale : `/subtitles` (choix de la série, puis page épisodes).
- Logique pure et testée dans `utils/subtitles.ts` (validation du fichier, tri, remplacement par langue,
  conversion SRT → VTT utilisée par le mock, liste des pistes, piste par défaut).

### Mise en avant (S05-WEB-02, B-05)

- `/featured` (barre latérale « Mise en avant »), trois onglets :
  - **Bannières** : table ordonnée par glisser-déposer (`PUT /admin/home/banners/order`), activation
    en ligne, création/édition (série avec recherche, image 16:9 envoyée par `presign` `kind: "poster"`,
    titre, sous-titre, pays, période de diffusion, actif), suppression avec confirmation, état de
    diffusion calculé (en ligne / programmée / terminée / désactivée).
  - **Rangées** : table ordonnée, création/édition par type (`MANUAL` avec liste de séries ordonnée,
    `TRENDING`, `NEW`, `GENRE` avec genre, `CONTINUE_WATCHING`), titres en quatre langues (français
    obligatoire), pays, actif. La **clé technique** (`key`, `[a-z0-9_-]{2,80}`, unique) est proposée
    automatiquement (`trending`, `genre-romance`, slug du titre français) et reste modifiable : le
    backend l'exige à la création.
  - **Aperçu** : `GET /admin/home/preview?country&lang` rendu comme l'accueil de l'application
    (bannières 16:9 puis rangées de cartes affiches) dans un cadre téléphone ; sélecteurs pays et langue.
    `utils/featured.ts` normalise les deux formes possibles des bannières publiques (résumé de série ou
    bannière éditoriale avec sa série).
- Rôles : EDITOR et ADMIN modifient ; les autres rôles voient la page en lecture seule (ou « Droits
  insuffisants » si l'API refuse la lecture).

### Planification (B-04)

Contrat : section « Back-office (B-04, B-11 v0) » de `docs/api/public-contract-v1.2.md`.

- Toutes les dates sont **stockées en UTC** et **affichées / saisies en heure de Lomé**
  (`SCHEDULE_TIME_ZONE = Africa/Lome`, UTC+0 toute l'année ; les conversions de `utils/schedule.ts`
  sont génériques et testées, DST compris). Les DatePicker PrimeVue travaillent en heure locale du
  navigateur : `toPickerDate()` / `fromPickerDate()` interprètent les champs choisis comme heure de
  Lomé quel que soit le fuseau du poste.
- **Fiche série** : bloc « Planification » → champ « Publication programmée » (`PATCH /admin/series/:id`
  avec `publishedAt`, `null` pour effacer), étiquette « Programmée le … » / « Publiée le … ».
- **Page Épisodes** : colonne Publication avec étiquette « Programmé le … » (date future) et icône
  calendrier ouvrant la date de l'épisode (`PATCH /admin/episodes/:id`) ; bouton « Planifier une sortie
  quotidienne » : premier jour, heure, N épisodes par jour, sélection des épisodes `PENDING`/`READY`,
  aperçu J+0, J+1… puis un `PATCH` par épisode (`dailyReleasePlan()` est pur et testé).
- `/schedule` (barre latérale « Planification ») : vue **Mois** (grille 6 semaines, lundi en premier,
  puces série / épisode, passé barré, « + n autres » ouvrant le jour) et vue **Liste** (agenda des
  90 prochains jours), alimentées par `GET /admin/schedule?from&to` (la réponse est normalisée :
  `{ items }` ou tableau, `kind` ou `type`). Un clic ouvre la fiche série ou la page des épisodes.
  Lecture ouverte à tous les rôles ; modification EDITOR / ADMIN.
- Mock : `GET /admin/schedule` calcule les séries et épisodes datés dans l'intervalle ; les fixtures
  reçoivent au chargement des dates futures (épisodes 2 à 5 de « Mariage sous contrat » à J+1…J+4
  18 h, brouillon « La Revanche de l'héritière » à J+7).

### Tableau de bord v0 (B-11)

- `/dashboard` (barre latérale « Tableaux de bord ») : `GET /admin/stats/overview?days=7|30`.
  Tuiles utilisateurs (actifs 24 h / 7 j / 30 j, nouveaux, inscrits et invités avec leur part),
  tuiles visionnage (commencés, terminés, **taux de complétion** = terminés ÷ commencés, « — » sans
  lecture), top séries en graphique (barres horizontales Chart.js via le composant `Chart` de
  PrimeVue, deux couleurs validées par le skill dataviz : spectateurs `#2a78d6`, complétions
  `#eb6834`) et en tableau (référence accessible, lien vers la fiche série). Sélecteur 7 / 30 jours
  (dans l'URL), bouton Actualiser, **actualisation automatique toutes les 5 minutes**
  (`createPoller`), états vide / chargement / erreur / droits insuffisants.
- Dérivations pures dans `utils/stats.ts` (`deriveTiles`, `completionRate` avec gardes zéro,
  `rankTopSeries`, `topSeriesChartData`, formats compacts FR).
- Mock : `mocks/stats.json` (chiffres plausibles par période), `generatedAt` = maintenant.

### Réconciliation des recharges (B-11, contrat v1.5)

- `/topup-reconciliation`, sous-entrée du menu « Tableaux de bord », MONETIZATION et ADMIN.
  `GET /admin/topup/reconciliation?date=YYYY-MM-DD` pour un **jour civil en heure de Lomé**
  (sélecteur avec flèches précédent/suivant, jamais de date future, bouton « Aujourd'hui »).
- Quatre tuiles (commandes, payées, créditées, écarts) avec les ratios payées/commandes et
  créditées/payées, un bandeau « tout concorde » ou « écarts à traiter ». Le total encaissé du
  jour est affiché en additionnant les montants **par devise** (`amounts: Price[]` renvoyés par
  l'API, pas un total unique : `utils/reconciliation.ts#formatAmounts`).
- Table des écarts (commande, utilisateur, pack, montant, statut, pièces créditées/attendues,
  raison : `PAID_NOT_CREDITED`, `CREDITED_NOT_PAID`, `AMOUNT_MISMATCH`, `COINS_MISMATCH`,
  `DUPLICATE_CREDIT`, `PROVIDER_UNKNOWN`) et **export CSV** (`reconciliationToCsv`, BOM UTF-8,
  une ligne par écart) pour la comptabilité ou l'agrégateur.
- Mock : `GET /admin/topup/reconciliation` regroupe les commandes du jour par statut et par
  devise à partir de `mocks/topup.json` (une commande `PAID` sans `creditedAt` simule un écart).

### Aide en ligne (S06-WEB-02)

- `web/docs/guide-back-office.md` : guide v1 en français pour l'équipe éditoriale (connexion et
  TOTP, séries, épisodes et upload, sous-titres, mise en avant, planification, tableau de bord,
  comptes et audit, erreurs fréquentes).
- Bouton **Aide** de la barre du haut → `/help` : le Markdown est importé au build (`?raw`) et
  rendu par `utils/markdown.ts` (mini-rendu maison : titres avec ancres et sommaire, listes,
  tableaux, citations, code ; la source est échappée, seules les balises générées sont injectées).

### Notifications push (B-10, contrat v1.3)

- `/campaigns` (barre latérale « Notifications »), réservé à MONETIZATION et ADMIN (les autres rôles
  voient « Droits insuffisants » sans appel API ; l'entrée est masquée du menu).
- Liste `GET /admin/campaigns` triée (envoyées / programmées / créées), étiquettes de statut
  (Brouillon, Programmée, Envoi en cours, Envoyée, Annulée) avec compteurs cliquables qui filtrent
  (filtre dans l'URL), audience, envoyés, date.
- Création / édition (brouillon et programmée) : titre (60), **message avec compteur 178 caractères**
  (comptage en points de code), lien d'ouverture facultatif validé (`drama://…`) avec un sélecteur de
  série produisant `drama://series/{id}`, cible `ALL | COUNTRY (pays) | SERIES_FOLLOWERS (série) |
INACTIVE (jours 1-365)` avec champs conditionnels, date d'envoi facultative saisie en heure de Lomé
  (`toPickerDate` / `fromPickerDate`). Le payload `segment` ne contient que le champ du type choisi
  (`segmentFromForm()`).
- « Estimer l'audience » (`POST /estimate`) ; « Envoyer » / « Programmer » relance l'estimation puis
  demande confirmation avec le nombre d'utilisateurs ; `POST /send` → `SENDING` (ou `SCHEDULED` si la
  date est future) ; « Annuler l'envoi » (`POST /cancel`) pour les programmées ; suppression des
  brouillons. Pendant un envoi, la liste est rechargée toutes les 5 s (`createPoller`).
- Tiroir de détail : aperçu façon notification Android, cible, lien, audience, envoyés (+ taux),
  créée par, chronologie (créée → programmée → envoi démarré → terminé, ou annulée) calculée par
  `campaignTimeline()` à partir des champs du contrat et des horodatages facultatifs
  (`sentAt`, `cancelledAt`, `updatedAt`) si le backend les fournit.
- Mock : audience factice par pays / série / inactivité, `SENDING → SENT` après
  `mockTiming.campaignSendMs` (93 % de l'audience), programmées échues déclenchées à la lecture,
  409 sur les transitions interdites.

### Centre d'aide (B-03bis, M-53, contrat v1.3)

- `/help-center` (barre latérale « Centre d'aide », badge = tickets ouverts pour SUPPORT/ADMIN,
  actualisé au montage et après chaque réponse / fermeture, `stores/support-inbox.ts`).
- **Onglet FAQ** (EDITOR, SUPPORT, ADMIN) : entrées `GET /admin/faq` regroupées par catégorie fixe
  (`account`, `coins`, `vip`, `playback`, `payment`, `content`, `other`, titres en 4 langues
  alignés sur le backend dans `utils/help-center.ts`), glisser-déposer dans une catégorie → `PUT /admin/faq/order` avec l'ordre
  global recalculé (`reorderWithinCategory()`), interrupteur « Publiée », création / édition avec
  question et réponse en FR (obligatoire), EN, ES, PT (traductions vides envoyées `null`, paire
  question + réponse exigée), suppression. **Aperçu téléphone** calculé localement par `faqPreview()`
  avec les mêmes règles que `GET /help/faq?lang` (publiées, repli français, catégories vides
  masquées), sélecteur de langue et étiquette « Repli sur le français ».
- **Onglet Support** (SUPPORT, ADMIN) : `GET /admin/support/tickets?status&page` (20 par page,
  ouverts par défaut, filtre dans l'URL), conversation (bulles utilisateur / support), réponse
  (`POST /reply`, 2 000 caractères) qui passe le ticket en `ANSWERED`, fermeture avec confirmation
  (`POST /close`, définitive : plus de réponse). Machine à états pure et testée
  (`ticketTransition()`).
- Mock : FAQ et tickets avec état, `GET /help/faq` public servi par `faqPreview()`, 403 pour les
  rôles non autorisés, 409 sur un ticket fermé.

### Monétisation (B-06, contrat v1.4)

- `/monetization` (barre latérale « Monétisation »), réservé à MONETIZATION et ADMIN (les autres
  rôles voient « Droits insuffisants » sans appel API ; l'entrée est masquée du menu). Quatre
  onglets (dans l'URL `?tab=`) :
  - **Paramètres** : `GET`/`PUT /admin/monetization/settings` — épisodes gratuits par défaut, coût
    par épisode, remise série complète (%), plafond de pubs par jour, déblocage automatique par
    défaut, validité des pièces bonus (jours). Bornes dans `SETTINGS_LIMITS`, enregistrement
    après confirmation listant les champs modifiés, rappel « tout est audité ».
  - **Packs de pièces** : `GET/POST/PATCH/DELETE /admin/monetization/packs` et `PUT /order`
    (glisser-déposer). Dialogue de création / édition : **SKU immuable après création**
    (« identique au produit Play Console », `SKU_RE`), pièces, pièces bonus, badge, actif, **prix
    par devise** XOF / NGN / GHS / EUR / USD saisis en unités majeures et envoyés en
    `amountMinor` (XOF sans décimale, 2 décimales ailleurs). Le bouton **« Compléter depuis le
    F CFA »** remplit les devises vides à partir du prix XOF avec des **taux indicatifs affichés et
    modifiables** (`DEFAULT_RATES_FROM_XOF`), arrondis « boutique » (`roundShopAmount`). Le prix
    XOF est obligatoire ; le `PATCH` n'envoie que les champs modifiés (`packFormToInput`).
  - **Formules VIP** : même schéma (`/admin/monetization/vip-plans`) avec période
    `WEEK | MONTH | YEAR` et jours d'essai ; tri semaine → mois → an.
  - **Simulateur** : pour un pays et un pack, ce que l'application affichera — devise du pays
    (`COUNTRY_CURRENCY`, repli USD), prix, pièces + bonus, prix par pièce, avertissement « repli
    dollar » ou « aucun prix » — et la boutique complète du pays dans un cadre téléphone.
    Logique pure dans `utils/monetization.ts` (`currencyForCountry`, `priceFor`,
    `simulateShopDisplay`, testées).
- Mock : paramètres, packs et formules avec état, `SKU_ALREADY_USED` (409), `SKU_IMMUTABLE`
  (400), ordre recalculé à la suppression, lignes d'audit `monetization_settings.update`,
  `coin_pack.*`, `vip_plan.*`.

### Récompenses (B-08, contrat v1.4)

- `/rewards` (barre latérale « Récompenses »), MONETIZATION et ADMIN. Onglet **Check-in** :
  `GET`/`PUT /admin/rewards/checkin` — barème sur 7 jours (`days`), **total sur 7 jours** calculé
  en direct (`checkinTotal`), interrupteur **« Un jour manqué remet la série à zéro »**
  (`resetOnMiss`), aperçu téléphone (jours reçus / aujourd'hui / à venir), confirmation avant
  enregistrement, validation (7 entiers ≥ 0, au moins un jour non nul). Onglet **Tâches** (M-41,
  contrat v1.5) : `GET /admin/rewards/tasks` liste les **six clés fixes** du MVP
  (`watch_3_episodes`, `watch_10_episodes`, `enable_notifications`, `share_series`,
  `complete_profile`, `add_favorite` — titre et description gérés par le serveur) ; chaque ligne
  s'édite avec `PATCH /admin/rewards/tasks/{key}` (**pièces**, **objectif**, **active**), tri des
  clés connues en premier (`sortTasks`), bandeau « potentiel hebdomadaire » (`weeklyTaskPotential` :
  une tâche quotidienne compte ×7, les autres ×1, seules les tâches actives comptent).
- Mock : barème avec état, 400 sur un barème invalide, audit `checkin_scale.update` ;
  `mocks/offers.json` fournit les six tâches, `PATCH` audité (`reward_task.update`), 400 sur des
  pièces négatives ou un objectif nul.

### Utilisateurs (B-09, contrat v1.4)

- `/users` (barre latérale « Utilisateurs »), SUPPORT et ADMIN. Recherche
  `GET /admin/users?q&page&pageSize` par e-mail, téléphone, nom ou identifiant (2 caractères au
  moins, requête dans l'URL), table paginée (20) → fiche `/users/{id}`.
- **Fiche** (`GET /admin/users/{id}`) : carte **Profil** (type, moyens de connexion, pays, langue,
  statut, dernière activité, inscription, appareils, VIP, anonymisation programmée), carte
  **Portefeuille** (achetées / bonus / total, déblocage automatique, bonus qui expirent, alerte
  solde négatif), carte **Abonnement**, onglets **Déblocages / Achats / Grand livre** (paginés
  côté client par 20 à partir des listes de la fiche ; `method` accepté en majuscules ou
  minuscules).
- Actions : **« Créditer / Débiter des pièces »** (`POST /admin/users/{id}/coins`) — sens,
  montant, catégorie (achetées / bonus), **motif obligatoire ≥ 10 caractères**, **aperçu du solde
  résultant** par catégorie (`adjustmentPreview`), refus local d'un débit supérieur au solde,
  confirmation récapitulative ; **« Bloquer / Débloquer »** (`POST /block` · `/unblock`) avec
  motif. Toute erreur 4xx est affichée en français (`userErrorKey` : `INSUFFICIENT_COINS`,
  `USER_ALREADY_BLOCKED`, `USER_NOT_BLOCKED`, `USER_NOT_FOUND`, `REASON_REQUIRED`,
  `VALIDATION_ERROR`, 409 générique).
- Mock : cinq utilisateurs (dont un bloqué, un VIP, un invité, un en suppression, un solde
  négatif) ; le **portefeuille est une projection du grand livre** en mémoire — un ajustement
  ajoute une ligne `ADJUSTMENT` (bonus avec expiration à `bonusValidityDays`), un débit excessif
  renvoie 409 `INSUFFICIENT_COINS`, le blocage met `devices` à 0 ; audit `user.coins_adjust`,
  `user.block`, `user.unblock` avec le motif.

### Offres et promos (B-07, contrat v1.5)

- `/offers` (barre latérale « Offres et promos »), MONETIZATION et ADMIN. Deux onglets :
  - **Offres** : carte **Offre de bienvenue** (`GET`/`PUT /admin/offers/welcome` — actif, pack
    concerné ou « tous les packs », **bonus en %**, fenêtre en **heures après l'inscription**,
    aperçu du bonus sur un pack) et table **Offres limitées** (`GET/POST/PATCH/DELETE
/admin/offers/limited` — titre, pack, bonus en %, période en **heure de Lomé**
    (`toPickerDate`/`fromPickerDate`), état `En cours`/Programmée/Terminée/Désactivée calculé par
    `offerState()`/`sortLimitedOffers()`). **Le backend réel exige `startsAt` en ISO 8601** (une
    valeur vide est envoyée comme l'instant courant par `limitedOfferToInput()`, malgré le
    contrat qui lit « vide = tout de suite »).
  - **Codes promo** : `GET/POST/PATCH /admin/promo-codes` — **code immuable après création**
    (`PROMO_CODE_RE`, majuscules/chiffres/4-32), générateur sans caractères ambigus
    (`generatePromoCode`/`generatePromoCodes`, préfixe facultatif), pièces offertes, quotas
    (global `maxUses` ou illimité, `perUserUses`), période facultative, barre d'utilisation
    (`promoUsageRatio`/`isPromoExhausted`). **Pas de route de suppression** : désactiver
    (`isActive: false`) retire un code. Tiroir **Utilisations** :
    `GET /admin/promo-codes/{id}/redemptions` (compte, pièces, date).
- L'éligibilité d'une série à la pub récompensée (M-22) se règle sur la fiche série
  (`adUnlockEnabled`, fieldset Monétisation) ; le plafond quotidien reste dans Monétisation →
  Paramètres (`adDailyCap`).
- Mock : `mocks/offers.json` (offre de bienvenue active, offres limitées et codes de démo),
  audité (`welcome_offer.update`, `limited_offer.*`, `promo_code.*`), `SKU`/pack inconnu → 404
  `PACK_NOT_FOUND`, code dupliqué → 409 `PROMO_CODE_ALREADY_USED`.

### Administration (S05-WEB-01, B-13)

- `/administration`, réservé au rôle ADMIN (les autres voient « Droits insuffisants » sans appel API).
- **Comptes** : table (e-mail, nom, rôle, actif, double authentification enrôlée, dernière connexion),
  création (rôle, mot de passe généré ou saisi, politique 12 caractères + majuscules/minuscules/chiffre),
  édition du nom, du rôle et de l'activation, réinitialisation de la double authentification et du mot
  de passe avec confirmation. Le mot de passe (créé ou réinitialisé) est **affiché une seule fois** avec
  un bouton Copier. Garde anti-verrouillage (`utils/accounts.ts`) : l'utilisateur courant ne peut ni se
  désactiver ni se retirer le rôle ADMIN (interrupteur désactivé, avertissement, et l'erreur 4xx du
  serveur est affichée si elle survient quand même).
- **Révoquer les appareils de confiance** d'un compte (`POST /admin/accounts/{id}/revoke-devices`).
- **Journal d'audit** : table paginée (20 par page, `GET /admin/audit-logs`), filtres auteur, action
  (recherche), type de cible, identifiant de cible et période ; ligne dépliable montrant la différence
  ancienne/nouvelle valeur (clés modifiées surlignées, JSON brut à la demande), `utils/audit-diff.ts`.

### Mode mock de bout en bout

`layers/base/mocks/index.ts` implémente le contrat avec un état en mémoire (réinitialisé au
rechargement) : filtres, pagination, création/édition, rôles (403), publication refusée (409),
épisodes (création, renommage, ordre, suppression), sous-titres (upload multipart conservé en mémoire
pour l'aperçu, SRT converti), bannières et rangées avec un aperçu calculé comme le `GET /home` public
(pays, dates, séries publiées), comptes internes reliés au flux de connexion (compte désactivé refusé,
réinitialisation TOTP → nouvel enrôlement, compte créé qui peut se connecter avec son mot de passe)
et journal d'audit alimenté par chaque mutation du mock, appareils de confiance (connexion sans code),
campagnes push (estimation, envoi simulé, programmation, annulation), FAQ (avec le `GET /help/faq`
public), tickets de support, paramètres de monétisation, packs et formules VIP, barème du check-in
et utilisateurs finaux (portefeuille projeté du grand livre, ajustements, blocage), tâches
récompensées, offres (bienvenue/limitées) et codes promo, commandes de recharge et les routes
publiques que réutilise le site de recharge (`/auth/otp/*`, `/auth/email/*`, `/auth/refresh`,
`/me`, `/wallet`, `/shop`, `/offers`, `/topup/orders*`, voir « Site de recharge » ci-dessous). Les
URL d'upload sont des `mock://upload/...`
traitées par `mockUploadTransport` (progression simulée, fichier conservé pour l'aperçu des affiches) ;
`POST /uploaded` fait passer l'épisode `UPLOADED` → `PROCESSING` (1,5 s) → `READY` (4 s), avec un
manifeste HLS pointant vers les échantillons `hls/samples/epN/` de `infra/media-samples` dans MinIO,
donc l'aperçu fonctionne réellement si MinIO tourne. Astuces de démonstration : un fichier dont le nom
contient `upload-error` échoue à l'envoi (bouton Relancer), un nom contenant `fail` finit en `FAILED`
(bouton Relancer le transcodage).

## Site de recharge (S09-WEB-01/02, contrat v1.5)

`apps/recharge` étend `layers/base` comme `apps/admin`, avec `ssr: true` (rendu serveur, §11 du
cahier des charges) et sa propre page de connexion : **même compte que l'application mobile**, par
les routes **publiques** `/auth/*` du contrat (pas le JWT admin). Chaque page sert moins de
300 Ko gzip de JS + CSS (mesuré sur le HTML rendu plus les scripts précompilés ; voir le compte
rendu de sprint pour le détail par page).

### Session et authentification

- `stores/recharge-session.ts` (couche de base) : connexion **téléphone + OTP**
  (`POST /auth/otp/request` puis `/auth/otp/verify`), **e-mail + mot de passe**
  (`/auth/email/login` ou `/auth/email/register`), **Google** (`/auth/google`, bouton masqué tant
  que `NUXT_PUBLIC_GOOGLE_CLIENT_ID` est vide). Jetons dans les cookies `drama_user_token` /
  `drama_user_refresh` (`SameSite=Lax`, pas `httpOnly` — même compromis documenté que le
  back-office, voir « Authentification » ci-dessus ; `Lax` plutôt que `Strict` car le retour du
  paiement est une navigation externe). `refresh()` fait tourner le jeton de rafraîchissement
  (jeton réutilisé = session révoquée côté serveur) ; `apps/recharge/plugins/api-session.ts`
  branche `useApi()` sur cette session (un 401 hors flux d'authentification tente un
  rafraîchissement puis renvoie vers `/login`) au lieu du store admin.
- `apps/recharge/middleware/auth.global.ts` : seules `/pay`, `/history`, `/account` et
  `/mock-payment` exigent une session ; `/`, `/login`, `/packs`, `/legal/*` sont publiques.
- `composables/useRechargePrefs.ts` : pays (`drama_country`) et langue (`drama_lang`) persistés un
  an en cookie pour que le rendu serveur parte directement dans la bonne devise et la bonne
  langue ; un compte connecté sans choix explicite reprend le pays de son profil.

### Pages

- `/` : explication en 4 étapes, sélecteur de pays, bouton de connexion ou lien direct vers les
  packs.
- `/login` : bascule téléphone/e-mail, compte de démonstration affiché en mode mock.
- `/packs` : `GET /shop` avec l'en-tête `X-Country`, badge **meilleur rapport**
  (`bestValueSku`), badge d'offre (`GET /offers` + `packOfferBadge()` — l'offre de bienvenue prime
  sur une offre limitée), avertissement de repli sur une autre devise
  (`isCurrencyFallback`), achat → `POST /topup/orders` (clé d'idempotence `newIdempotencyKey()`).
- `/pay/{orderId}` : résumé (pièces, montant, expiration), bouton **Payer** qui ouvre le
  `paymentUrl` renvoyé par la commande (page réelle de l'agrégateur en production, page simulée de
  l'API en dev), puis sonde `GET /topup/orders/{id}` toutes les 3 s au retour
  (`createPoller`, jusqu'à 2 min) jusqu'à `PAID` (solde affiché via `GET /wallet`), `FAILED` ou
  `EXPIRED` (bouton **Réessayer**, nouvelle commande). La machine à états (`payStep()`) et le
  mémo de commande (`stores/topup-orders.ts`, `sessionStorage`) sont dans `utils/topup.ts`.
  **Les pièces créditées sont `coins + bonusCoins` additionnés** (`orderTotalCoins()`) : l'API
  réelle renvoie les deux séparément plutôt qu'un total unique.
- `/history` : `GET /topup/orders?page`, le plus récent en premier, « Charger plus ».
- `/account` : solde (`GET /wallet`, pièces achetées/bonus, lots bonus qui expirent), profil
  (`GET /me`), préférence de pays, déconnexion.
- `/legal/cgv`, `/legal/confidentialite` : textes provisoires marqués comme tels (§14 — la version
  définitive viendra du conseil juridique du client avant la mise en ligne).

### Mode mock et paiement simulé

- Les routes publiques (`/auth/*`, `/me`, `/wallet`, `/shop`, `/offers`, `/topup/orders*`) sont
  simulées dans `layers/base/mocks/index.ts` (sessions et jetons de rafraîchissement en mémoire,
  `mocks/topup.json` pour l'historique de démonstration).
- `/mock-payment/{orderId}` (mode mock uniquement) reproduit la page que l'API sert réellement en
  développement (`/topup/fake/{orderId}`, agrégateur simulé) : boutons **Payer** / **Échouer**
  qui appellent la route mock `POST /topup/orders/{id}/mock-pay` (idempotente), créditent le
  grand livre (achat + bonus, offre de bienvenue ou limitée appliquée automatiquement) et
  renvoient vers `/pay/{orderId}?returned=1` pour reprendre la sonde.

### Langues

FR par défaut, EN/ES/PT via la couche i18n commune (`layers/base/i18n/locales/{es,pt}.json` ne
portent que le site de recharge et quelques clés partagées ; le reste retombe sur le français,
`missingWarn`/`fallbackWarn` désactivés pour ne pas polluer la console).

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
