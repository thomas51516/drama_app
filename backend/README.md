# DRAMA — Backend API

API REST du MVP de micro-séries verticales : monolithe modulaire **NestJS 12** (TypeScript, ESM) sur **PostgreSQL 16** (Prisma 7) et **Redis 7**. Documentation OpenAPI servie sur `/docs`.

Référence fonctionnelle : `docs/Cahier des charges — Application de micro-séries verticales (Android).md` (§5, §8, §9). Contrat back-office : `docs/api/admin-contract-v1.md` (+ addendum v1.1). Tickets livrés : Sprint 1 (S01-BE-01/02/03), Sprint 2 (S02-BE-01 auth invité, S02-BE-02 limitation de débit, S02-BE-03 OpenAPI v1, S02-BE-04 upload pré-signé, S02-BE-05 transcodage, S02-OPS-02 observabilité), Sprint 3 : S03-BE-01 (admin séries), S03-BE-02 (admin épisodes), S03-BE-03 (sous-titres SRT/VTT), S03-BE-04 (auth admin 2FA), S04-BE-01 (accueil paramétré par la mise en avant B-05, Tendances réelles, i18n des rangées), S04-BE-04 (cache Redis du catalogue), B-13 (comptes internes et journal d'audit).

## Prérequis

- Node.js **24** et npm 11 (voir `engines` dans `package.json`).
- Docker avec `docker compose` pour PostgreSQL, Redis et MinIO : `docker compose -f infra/docker-compose.dev.yml up -d` depuis la racine (détails dans `infra/README.md`).
- **ffmpeg ≥ 6** (avec `ffprobe`) sur la machine pour le transcodage local (`TRANSCODE_PROVIDER=local`, défaut en dev) : `sudo apt install ffmpeg`. Inutile en mode `webhook`.

## Démarrage rapide

```bash
cd backend
cp .env.example .env            # valeurs par défaut alignées sur infra/docker-compose.dev.yml
npm install                     # installe les dépendances et génère le client Prisma (postinstall)
npm run prisma:deploy           # applique les migrations
npm run db:seed                 # 4 comptes internes (admin, editor, monetization, support @drama.local), 1 série publiée (3 épisodes), 1 brouillon, accueil (1 bannière, 6 rangées)
npm run dev                     # http://localhost:3000 — Swagger : http://localhost:3000/docs — métriques : /metrics
```

Vérification : `curl -s localhost:3000/health | jq` doit renvoyer `"status": "ok"` avec `database` et `redis` à `up`.

Test d'ingestion vidéo complet (API démarrée, MinIO et ffmpeg présents) : `npx tsx scripts/smoke-ingest.ts` génère un mp4 vertical de 5 s, se connecte en admin (2FA), crée série + épisode, fait le PUT pré-signé, appelle `/uploaded`, attend le worker et vérifie que `master.m3u8` est servi par MinIO.

## Commandes

| Commande | Rôle |
| --- | --- |
| `npm run dev` | Démarre l'API en rechargement à chaud |
| `npm run build` / `npm run start:prod` | Compile dans `dist/` puis lance `node dist/main.js` |
| `npm run lint` / `npm run lint:fix` | ESLint (règles typées) + Prettier |
| `npm run format` | Formate `src/`, `test/`, `prisma/` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Tests unitaires (Vitest, `src/**/*.spec.ts`), sans dépendance externe |
| `npm run test:e2e` | Tests de bout en bout (`test/**/*.e2e-spec.ts`) sur PostgreSQL + Redis réels |
| `npm run test:cov` | Couverture |
| `npm run prisma:generate` | Regénère le client dans `src/generated/prisma` (ignoré par git) |
| `npm run prisma:validate` | Valide `prisma/schema.prisma` |
| `npm run prisma:migrate -- --name <nom>` | Crée et applique une migration (dev) |
| `npm run prisma:deploy` | Applique les migrations en attente (CI, staging, prod) |
| `npm run prisma:reset` | Recrée la base de zéro, rejoue les migrations puis le seed |
| `npm run prisma:studio` | Interface d'exploration des données |
| `npm run db:seed` | Joue `prisma/seed.ts` (idempotent) |
| `npm run openapi:export` | Écrit `docs/api/openapi.v1.json` sans ouvrir de port (CI échoue si le fichier est périmé) |
| `npx tsx scripts/smoke-ingest.ts [url]` | Ingestion de bout en bout (upload pré-signé → transcodage ffmpeg → manifeste HLS) sur une API en marche |

## Variables d'environnement

Toutes les variables sont documentées dans **`.env.example`** et validées au démarrage par `src/config/env.schema.ts` (zod). L'API refuse de démarrer si une variable obligatoire manque ou est invalide. **Ne jamais committer `.env`.**

| Variable | Obligatoire | Rôle |
| --- | --- | --- |
| `NODE_ENV`, `PORT`, `LOG_LEVEL`, `CORS_ORIGINS`, `SWAGGER_ENABLED` | non | Application |
| `DATABASE_URL` | **oui** | Connexion PostgreSQL |
| `REDIS_URL` | **oui** | Connexion Redis |
| `JWT_ACCESS_SECRET`, `JWT_ACCESS_TTL_SECONDS` | **oui** / non | JWT d'accès (HS256, 15 min par défaut) |
| `JWT_REFRESH_SECRET`, `JWT_REFRESH_TTL_DAYS` | **oui** / non | Pepper de hachage des jetons de rafraîchissement, durée de vie (30 j) |
| `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, `S3_FORCE_PATH_STYLE` | clés **oui** | Stockage objet (MinIO en dev) |
| `CDN_BASE_URL`, `PLAYBACK_URL_TTL_SECONDS` | non | Base publique des manifestes HLS, validité des URLs de lecture |
| `ADMIN_JWT_SECRET`, `ADMIN_JWT_TTL_SECONDS` | **oui** / non | JWT du back-office (secret distinct, `aud: admin`, 8 h par défaut) |
| `TOTP_ENCRYPTION_KEY`, `TOTP_ISSUER` | **oui** / non | Chiffrement AES-256-GCM des secrets TOTP en base, libellé dans l'app d'authentification |
| `UPLOAD_URL_TTL_SECONDS` | non | Validité des URLs pré-signées PUT (15 min) |
| `TRANSCODE_PROVIDER`, `TRANSCODE_WORKER_ENABLED`, `TRANSCODE_CONCURRENCY` | non | `local` (ffmpeg + BullMQ dans le processus) ou `webhook` (service géré) ; worker dans ce processus ; jobs simultanés |
| `TRANSCODE_WEBHOOK_SECRET`, `TRANSCODE_SUBMIT_URL` | mode webhook | Secret HMAC-SHA256 de `POST /webhooks/transcode/{provider}` ; URL de notification du service géré (optionnelle) |
| `FFMPEG_PATH`, `FFPROBE_PATH` | non | Binaires ffmpeg / ffprobe (mode local) |
| `RATE_LIMIT_ENABLED` | non | Limites Redis sur `/auth/*` et `/admin/auth/*` |
| `METRICS_ENABLED`, `METRICS_TOKEN` | non | `GET /metrics` Prometheus ; si le jeton est défini, `Authorization: Bearer` requis |
| `SENTRY_DSN`, `SENTRY_TRACES_SAMPLE_RATE`, `SENTRY_ENVIRONMENT` | non | Sentry activé uniquement si le DSN est défini (5xx capturées) |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | non | Compte admin créé par le seed (les comptes editor/monetization/support partagent le mot de passe) |

## Carte des modules (`src/`)

| Dossier | Rôle | État |
| --- | --- | --- |
| `config/` | Validation zod de l'environnement, `AppConfig` injectable | Fait |
| `prisma/`, `redis/` | Connexions partagées (modules globaux) | Fait |
| `cache/` | `CatalogCacheService` (global) : cache Redis des réponses publiques non personnalisées et invalidation par série / accueil | Fait (S04-BE-04) |
| `common/` | Décorateurs `@Public()` / `@CurrentUser()` / `@AdminRoute()` / `@Roles()` / `@CurrentAdmin()`, filtre d'exceptions (`ApiErrorDto`, capture Sentry des 5xx), journal des requêtes, `rate-limit/` (garde Redis + `@RateLimit()`), `crypto/` (TOTP RFC 6238, `SecretBox` AES-256-GCM), `i18n/` (`Accept-Language`, `X-Country`, libellés de langues), `subtitles/` (conversion SRT → WebVTT) | Fait |
| `health/` | `GET /health` (PostgreSQL + Redis, 503 si dégradé), `GET /health/live` | Fait |
| `metrics/` | `GET /metrics` Prometheus : métriques Node, histogramme HTTP par route/statut | Fait (S02-OPS-02) |
| `observability/` | Initialisation Sentry conditionnelle (`SENTRY_DSN`) | Fait |
| `storage/` | Client S3 (MinIO en dev) : URLs pré-signées PUT/GET, head, upload de dossier, suppression par préfixe, URL publique CDN | Fait (S02-BE-04) |
| `transcode/` | Port `TranscodeProvider` + adaptateurs `local` (file BullMQ `transcode`, worker ffmpeg : HLS CMAF 360p→1080p, extrait 15 s, vignette) et `webhook` ; `POST /webhooks/transcode/{provider}` signé HMAC ; compteurs Prometheus | Fait (S02-BE-05) |
| `auth/` | `POST /auth/guest`, `POST /auth/refresh` (rotation, détection de réutilisation), garde JWT globale, limites de débit | Fait ; `/auth/google`, `/auth/otp/*` documentés, 501 jusqu'à S05 |
| `catalog/` | `GET /home` (construit par `HomeService` à partir de la configuration B-05), `/series`, `/series/{id}`, `/series/{id}/episodes` (pistes de sous-titres), `/feed` ; calcul des droits (`EntitlementService`) ; en-têtes `X-Country` / `Accept-Language` | Fait ; `GET /search` documenté, 501 jusqu'à S05 |
| `playback/` | `POST /episodes/{id}/play` (403 `EPISODE_LOCKED`), `PUT /progress` | Fait ; URL signée : S04-BE-02 |
| `unlock/`, `wallet/`, `billing/`, `rewards/`, `users/` | Endpoints §8.2 documentés avec leurs DTO (contrat figé pour le mock Android) | 501 `NOT_IMPLEMENTED` — S05, S07, S08, S09 |
| `admin/auth/` | `POST /admin/auth/login` (Argon2id) → `POST /admin/auth/totp/verify` (TOTP obligatoire, enrôlement à la première connexion) → JWT admin ; `GET /me`, `POST /logout` (liste de révocation Redis) ; `AdminAuthGuard` + `@Roles()` | Fait (S03-BE-04) |
| `admin/series/` | CRUD séries, publication (409 sans épisode READY), archivage, règles de rôle sur la monétisation | Fait (S03-BE-01) |
| `admin/episodes/` | Épisodes (numérotation auto, réordonnancement, suppression), URL d'upload pré-signée, `/uploaded`, `/retranscode`, `POST /admin/uploads/presign` (affiches) | Fait (S03-BE-02) |
| `admin/subtitles/` | `GET/POST /admin/episodes/{id}/subtitles` (multipart `.srt` / `.vtt`, 2 Mo, conversion WebVTT, une piste par langue), `DELETE /admin/subtitles/{id}` | Fait (S03-BE-03) |
| `admin/home/` | Bannières et rangées de l'accueil (`/admin/home/banners`, `/admin/home/rows`, `…/order`), `GET /admin/home/preview` | Fait (B-05, S04-BE-01) |
| `admin/accounts/` | `GET/POST /admin/accounts`, `PATCH /admin/accounts/{id}`, `reset-totp`, `reset-password`, `GET /admin/audit-logs` (rôle ADMIN) | Fait (B-13) |
| `admin/audit/` | `AuditService` : auteur, action, cible, ancienne / nouvelle valeur, IP pour chaque mutation | Fait |
| `openapi/` | Construction du document Swagger v1 (`/docs`, `/docs-json`, `/docs-yaml`) | Fait |
| `generated/prisma/` | Client Prisma généré — **ne pas modifier, ignoré par git** | — |

Chaque méthode encore planifiée porte un `TODO <ticket>` et répond `501 NOT_IMPLEMENTED` ; elle est documentée dans `/docs` avec ses DTO (OpenAPI v1, S02-BE-03).

### Authentification

1. `POST /auth/guest` au premier lancement → `user` + `tokens` (`accessToken` JWT 15 min, `refreshToken` opaque 30 j).
2. Toutes les routes non publiques exigent `Authorization: Bearer <accessToken>` ; les routes du catalogue sont publiques mais se personnalisent si un jeton est présent.
3. `POST /auth/refresh` renvoie une nouvelle paire et révoque l'ancien jeton. Réutiliser un jeton révoqué révoque toute la famille (`401 REFRESH_TOKEN_REUSED`).

### Back-office (contrat `docs/api/admin-contract-v1.md`)

1. `POST /admin/auth/login` `{ email, password }` → `{ status: "totp_required", challengeToken }` ou, à la première connexion, `{ status: "totp_setup_required", challengeToken, secret, otpauthUri }` (QR code à afficher). Le défi expire en 5 min et est à usage unique.
2. `POST /admin/auth/totp/verify` `{ challengeToken, code }` → `{ accessToken, expiresIn, user }`. Le JWT admin est signé avec `ADMIN_JWT_SECRET` (`aud: admin`, `iss: drama-admin`) : un JWT utilisateur n'ouvre jamais `/admin/*` et inversement.
3. Toutes les routes `/admin/*` portent `@AdminRoute()` + `AdminAuthGuard` : jeton valide, non révoqué (`POST /admin/auth/logout` inscrit le `jti` dans Redis jusqu'à expiration), compte actif, rôle autorisé par `@Roles()` (403 `FORBIDDEN_ROLE`).
4. Rôles : lecture pour tout compte actif ; séries et épisodes : EDITOR et ADMIN ; `freeEpisodeCount` / `coinCostPerEpisode` : MONETIZATION et ADMIN uniquement (403 `FORBIDDEN_FIELDS` sinon).
5. Le secret TOTP est stocké chiffré (AES-256-GCM, clé dérivée de `TOTP_ENCRYPTION_KEY`) ; `totp_enabled_at` distingue l'enrôlement en attente de la 2FA active.
6. Chaque mutation écrit une ligne `audit_logs` (`series.create|update|publish|archive`, `episode.create|update|delete|reorder|upload_url|uploaded|retranscode|transcoded|transcode_failed`, `subtitle.upload|replace|delete`, `home_banner.create|update|delete|reorder`, `home_row.create|update|delete|reorder`, `admin_account.create|update|reset_totp|reset_password`, `upload.presign`, `admin.login|logout|totp_enrolled`) avec l'ancienne et la nouvelle valeur des champs modifiés.

### Sous-titres (S03-BE-03, B-03)

1. `POST /admin/episodes/{id}/subtitles` en `multipart/form-data` : champ `file` (`.srt` ou `.vtt`, 2 Mo max, sinon `413 PAYLOAD_TOO_LARGE`) et champ `language` (ISO 639-1, `pt-BR` accepté). Rôles EDITOR et ADMIN.
2. Le SRT est converti en WebVTT côté serveur (`src/common/subtitles/srt-to-vtt.ts`, sans dépendance : BOM, CRLF, numéros de cue, `,` → `.`, heures absentes, balises `{\an8}` retirées) ; un `.vtt` est normalisé (en-tête `WEBVTT` obligatoire). Erreurs : `400 SUBTITLE_INVALID_FORMAT | SUBTITLE_PARSE_ERROR (details.line) | SUBTITLE_FILE_REQUIRED`.
3. Fichier déposé sous `subtitles/{episodeId}/{language}.vtt` (`Content-Type: text/vtt`), une piste par (épisode, langue) : ré-importer remplace. `DELETE /admin/subtitles/{id}` supprime la ligne et l'objet.
4. Côté public, `GET /series/{id}/episodes` et `POST /episodes/{id}/play` exposent `subtitles: [{ language, label, url }]` (`label` = nom de la langue dans sa langue : « Français », « English », « Español », « Português » ; `subtitleLanguages` est conservé pour compatibilité). Le bucket est en lecture anonyme avec CORS ouvert (`infra/README.md`).

### Accueil paramétré (B-05, S04-BE-01)

1. Tables `home_banners` et `home_rows` (`prisma/schema.prisma`), administrées par `/admin/home/*` (rôles EDITOR et ADMIN) : bannière = série + visuel + accroche + pays + fenêtre `startsAt`/`endsAt` ; rangée = `key` unique, `type` (`TRENDING | NEW | GENRE | MANUAL | CONTINUE_WATCHING`), `titles { fr (obligatoire), en, es, pt }`, `genre` (GENRE), `seriesIds` ordonnés (MANUAL), `countries` (vide = partout), `position`, `isActive`. `PUT …/order` exige la liste complète des identifiants (`400 HOME_ORDER_MISMATCH`).
2. `GET /home` : bannières actives (dans leur fenêtre, série publiée et autorisée sur le territoire) puis rangées actives, filtrées par pays et titrées dans la langue de `Accept-Language` (repli fr). `TRENDING` = séries classées par spectateurs distincts dont `watch_progress` a bougé sur 7 jours (complétées par les nouveautés), `NEW` = dernières publiées, `GENRE` = séries publiées du genre, `MANUAL` = liste ordonnée, `CONTINUE_WATCHING` = uniquement avec un jeton utilisateur. Les rangées vides sont omises ; 12 séries par rangée.
3. Pays du spectateur : en-tête `X-Country` (ISO 3166-1 alpha-2), sinon pays du compte, sinon aucun filtre (toutes les rangées, tous les territoires). `GET /admin/home/preview?country=TG&lang=en` renvoie la réponse publique sans cache.
4. Réponse (`HomeResponseDto`) : `banners[]` = `SeriesSummaryDto` + `bannerId`, `imageUrl` (repli : affiche horizontale), `bannerTitle`, `bannerSubtitle` ; `rows[] = { key, type, title, items }` (compatible v1.0, champ `type` ajouté).

### Cache Redis du catalogue (S04-BE-04)

- `GET /home` : 60 s par (pays, langue), hors « Continuer à regarder » (calculé après le cache). `GET /series/{id}` et `GET /series/{id}/episodes` : 120 s par (série, pays) ; la grille est mise en cache dans sa variante anonyme et le statut `access` / `coinCost` est recalculé pour le spectateur connecté.
- Clés `cache:v1:home:{pays|*}:{langue}` et `cache:v1:series:{id}:{detail|episodes}:{pays|*}`. Invalidation explicite (`CatalogCacheService.invalidateSeries` / `invalidateHome`) à chaque PATCH / publication / archivage de série, modification / suppression / réordonnancement d'épisode, passage d'un épisode en READY, import ou suppression de sous-titres, et modification de la configuration de l'accueil. Sans Redis : calcul direct (fail-open, journalisé).

### Comptes internes et journal d'audit (B-13)

- `/admin/accounts` (rôle ADMIN) : création (`password` ≥ 10 caractères, Argon2id, `409 ADMIN_EMAIL_TAKEN`), modification du nom / rôle / activation, `POST …/reset-totp` (secret et enrôlement effacés : `totp_setup_required` à la prochaine connexion), `POST …/reset-password`. Garde-fous : un admin ne peut ni se désactiver ni se retirer le rôle ADMIN (`403 ADMIN_SELF_LOCKOUT`) ; le dernier ADMIN actif ne peut être ni désactivé ni rétrogradé (`409 LAST_ADMIN`).
- `GET /admin/audit-logs?page&pageSize&actorId&action&targetType&targetId&from&to` : antichronologique, `action` exacte ou préfixe terminé par un point (`series.`), index sur `created_at`, `(actor_id, created_at)`, `(action, created_at)`, `(target_type, target_id)`.

### Upload et transcodage (§9)

1. `POST /admin/episodes/{id}/upload-url` `{ fileName, contentType, sizeBytes }` → URL pré-signée PUT (15 min) sur `sources/{seriesId}/{episodeId}/{fileName}` ; le navigateur envoie le fichier directement à MinIO/S3 (CORS configuré dans `infra/docker-compose.dev.yml`).
2. `POST /admin/episodes/{id}/uploaded` vérifie l'objet (409 `SOURCE_NOT_UPLOADED`), passe l'épisode en `UPLOADED` et le soumet au fournisseur : en mode `local`, job BullMQ `transcode` consommé par le worker du processus (statut `PROCESSING`, puis `READY` avec `hlsKey=hls/{episodeId}/master.m3u8`, `previewKey`, `thumbnailUrl`, `durationSeconds` lu par ffprobe, ou `FAILED` avec `transcodeError`). Rendus identiques à `infra/media-samples/generate.sh` : 360p/540p/720p/1080p CMAF, segments 2 s, extrait 15 s en 540p, vignette ; les sources non 9:16 sont réduites puis complétées en noir.
3. Mode `webhook` : l'épisode passe en `PROCESSING` (et le service géré est notifié si `TRANSCODE_SUBMIT_URL` est défini) ; la fin arrive sur `POST /webhooks/transcode/{provider}` signé `X-Transcode-Signature: sha256=<HMAC-SHA256(secret, [timestamp "."] corps brut)>` (`X-Transcode-Timestamp` optionnel, ±5 min), ciblage par `episodeId`, `externalId` ou `sourceKey`.
4. Le back-office interroge `GET /admin/series/{id}/episodes` toutes les 5 s tant qu'un épisode est en `PROCESSING`.

### Limitation de débit (S02-BE-02)

Fenêtres fixes Redis (`rl:*`), 429 `RATE_LIMITED` au format `ApiErrorDto` avec `Retry-After` : `/admin/auth/login` 5 / e-mail / 15 min et 20 / IP / 15 min ; `/admin/auth/totp/verify` 30 / IP ; `/auth/guest` 30 / IP ; `/auth/refresh` 120 / IP ; `/auth/google`, `/auth/otp/*` 10-30 / IP. Si Redis est indisponible la requête passe (fail-open, journalisé) ; `RATE_LIMIT_ENABLED=false` désactive tout.

### Observabilité (S02-OPS-02)

- `GET /metrics` (Prometheus, exclu de Swagger) : métriques Node (`drama_process_*`, `drama_nodejs_*`), `drama_http_request_duration_seconds{method,route,status_code}`, `drama_transcode_jobs_total{status,provider}`, `drama_transcode_job_duration_seconds`, `drama_transcode_active_jobs`. Endpoint interne : ne pas l'exposer par le reverse proxy, ou définir `METRICS_TOKEN`.
- Sentry : `SENTRY_DSN` renseigné → initialisation au démarrage et capture des 5xx (avec `requestId`, méthode, chemin, code).
- Pile Prometheus + Grafana (tableau de bord latence / erreurs / transcodage) : `docker compose -f infra/docker-compose.monitoring.yml up -d` (voir `infra/README.md`).

### Format des erreurs

Toutes les erreurs suivent `ApiErrorDto` : `{ statusCode, code, message, details?, path, timestamp, requestId }`. Le champ `code` est stable (`VALIDATION_ERROR`, `UNAUTHENTICATED`, `EPISODE_LOCKED`, `SERIES_NOT_FOUND`, ...) et destiné à la localisation côté application. L'en-tête `x-request-id` est renvoyé sur chaque réponse.

## Données : grand livre et migrations

Le schéma (`prisma/schema.prisma`) couvre toutes les entités du cahier des charges §8.3 (utilisateurs, séries, épisodes, sous-titres, portefeuilles, grand livre, déblocages, achats, abonnements, progression, favoris, comptes internes, jetons, journal d'audit). La règle fondamentale est documentée en tête du fichier : **toute variation de pièces est une ligne `coin_ledger`, le solde du portefeuille n'est qu'une projection**.

### Ajouter une migration

```bash
# 1. Modifier prisma/schema.prisma
# 2. Créer et appliquer la migration sur la base de dev (regénère aussi le client)
npm run prisma:migrate -- --name add_series_license_dates
# 3. Vérifier qu'elle se rejoue de zéro (critère S01-BE-02)
npm run prisma:reset
# 4. Committer prisma/schema.prisma ET prisma/migrations/<horodatage>_<nom>/
```

Règles : ne jamais éditer une migration déjà fusionnée ; une migration de données se fait en SQL dans le dossier de migration ; en CI/staging/prod seul `prisma migrate deploy` est utilisé.

## Tests

- **Unitaires** (`npm test`) : services avec Prisma, Redis, S3 et ffmpeg simulés (`vi.fn()`). Couverts : santé, auth (création invité, rotation, réutilisation), catalogue (cache par pays, recalcul de l'accès après cache), constructeur de l'accueil (types de rangées, classement Tendances, filtre pays, choix de la langue, « Continuer à regarder » hors cache), cache et invalidation, conversion SRT → VTT (BOM, CRLF, numéros, horodatages), `Accept-Language` / `X-Country` / libellés de langues, TOTP (vecteurs RFC 6238) et chiffrement, auth admin (enrôlement, vérification, révocation) et garde de rôles, séries (règle de publication, règles de rôle, journal d'audit), épisodes (numérotation, renumérotation, upload), règles de la mise en avant (genre / séries requis, fenêtre, ordre), comptes internes (auto-verrouillage, dernier admin, politique de mot de passe, filtres du journal), pipeline de transcodage (ffmpeg simulé, succès / échec), signature des webhooks, garde de limitation de débit.
- **E2E** (`npm run test:e2e`) : montent l'application complète sur `DATABASE_URL` (migrations appliquées), Redis et MinIO ; `test/app.e2e-spec.ts` (santé, auth invité, catalogue, `/docs-json`), `test/admin.e2e-spec.ts` (connexion 2FA complète, révocation, 429, CRUD séries et épisodes, PUT réel sur l'URL pré-signée, `/uploaded`, webhook signé → READY → publication, `/metrics`) et `test/admin-sprint3.e2e-spec.ts` (import SRT réel → VTT lu sur MinIO avec en-tête `Origin`, exposition sur `/episodes` et `/play`, configuration de l'accueil → `GET /home` par pays et langue avec invalidation du cache, comptes internes, `reset-totp`, journal d'audit). Le fournisseur de transcodage y est forcé en `webhook` ; le pipeline ffmpeg réel est couvert par `scripts/smoke-ingest.ts`. Les lignes créées sont supprimées en fin de test.

## Intégration continue

`.github/workflows/backend-ci.yml` : sur tout push/PR touchant `backend/**` — Node 24, ffmpeg, `npm ci`, `prisma validate` + `generate`, lint, tests unitaires, build, migrations sur un PostgreSQL de service, tests e2e (PostgreSQL, Redis et MinIO de service, `TRANSCODE_PROVIDER=webhook`), export OpenAPI v1 et vérification que `docs/api/openapi.v1.json` est à jour.
