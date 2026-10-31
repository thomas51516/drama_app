# DRAMA — Backend API

API REST du MVP de micro-séries verticales : monolithe modulaire **NestJS 12** (TypeScript, ESM) sur **PostgreSQL 16** (Prisma 7) et **Redis 7**. Documentation OpenAPI servie sur `/docs`.

Référence fonctionnelle : `docs/Cahier des charges — Application de micro-séries verticales (Android).md` (§5, §8, §9). Contrat back-office : `docs/api/admin-contract-v1.md` (+ addendum v1.1). Tickets livrés : Sprint 1 (S01-BE-01/02/03), Sprint 2 (S02-BE-01 auth invité, S02-BE-02 limitation de débit, S02-BE-03 OpenAPI v1, S02-BE-04 upload pré-signé, S02-BE-05 transcodage, S02-OPS-02 observabilité), Sprint 3 : S03-BE-01 (admin séries), S03-BE-02 (admin épisodes), S03-BE-03 (sous-titres SRT/VTT), S03-BE-04 (auth admin 2FA), S04-BE-01 (accueil paramétré par la mise en avant B-05, Tendances réelles, i18n des rangées), S04-BE-04 (cache Redis du catalogue), B-13 (comptes internes et journal d'audit). Sprint 4 (contrat public `docs/api/public-contract-v1.2.md`) : S04-BE-02 (URLs de lecture signées), S04-BE-03 (flux enrichi), S05-BE-01/02/03 (Google, OTP SMS, e-mail, rattachement et fusion de l'invité), S05-BE-04 (`/me`, suppression différée), S05-BE-05 (favoris, « J'aime »), S05-BE-06 (recherche plein texte), B-04 (publication programmée), B-11 v0 (tableau de bord). Sprint 7 (contrat `docs/api/contract-v1.5-sprint7.md`) : S08-BE-04 (check-in et tâches récompensées, B-08), S08-BE-03 (pub récompensée, SSV `admob`/`fake`), S10-BE-02/03 (déblocage de série entière, offre de bienvenue, offres limitées et codes promo, B-07), S09-BE-01/02 (recharge mobile money `fake`/`cinetpay`, réconciliation), M-04 (classements), DEF-012 (genres localisés).

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
npm run db:seed                 # 4 comptes internes, 1 série publiée (3 épisodes), 1 brouillon, accueil, paramètres de monétisation, 4 packs de pièces, 3 formules VIP, FAQ
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
| `DATABASE_POOL_SIZE` | non | Taille du pool de connexions `pg` (défaut 20 ; le défaut de la librairie `pg` est 10, trop bas sous charge — S10-OPS-01) |
| `REDIS_URL` | **oui** | Connexion Redis |
| `JWT_ACCESS_SECRET`, `JWT_ACCESS_TTL_SECONDS` | **oui** / non | JWT d'accès (HS256, 15 min par défaut) |
| `JWT_REFRESH_SECRET`, `JWT_REFRESH_TTL_DAYS` | **oui** / non | Pepper de hachage des jetons de rafraîchissement, durée de vie (30 j) |
| `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, `S3_FORCE_PATH_STYLE` | clés **oui** | Stockage objet (MinIO en dev) |
| `CDN_BASE_URL`, `PLAYBACK_URL_TTL_SECONDS` | non | Base publique des manifestes HLS, validité des URLs de lecture |
| `MEDIA_SIGNER`, `MEDIA_SIGNING_KEY` | non / mode hmac | Signature des URLs de lecture : `plain` (dev MinIO, défaut) ou `hmac` (jeton CDN, clé ≥ 16 caractères) |
| `GOOGLE_CLIENT_IDS` | non | Audiences OAuth (Web, Android) acceptées pour l'ID token, séparées par des virgules ; vide = `503 GOOGLE_AUTH_DISABLED` |
| `SMS_PROVIDER`, `SMS_HTTP_URL`, `SMS_HTTP_TOKEN` | non / mode http | OTP : `console` (code dans les logs et Redis `otp:<requestId>`) ou `http` (POST JSON `{ to, text }`, bearer) |
| `ACCOUNT_DELETION_GRACE_DAYS`, `SCHEDULER_ENABLED` | non | Délai avant anonymisation d'un compte supprimé (30 j) ; tâches planifiées dans ce processus (publications programmées, anonymisation) |
| `ADMIN_JWT_SECRET`, `ADMIN_JWT_TTL_SECONDS` | **oui** / non | JWT du back-office (secret distinct, `aud: admin`, 8 h par défaut) |
| `TOTP_ENCRYPTION_KEY`, `TOTP_ISSUER` | **oui** / non | Chiffrement AES-256-GCM des secrets TOTP en base, libellé dans l'app d'authentification |
| `TRUSTED_DEVICE_DAYS` | non | Durée d'un appareil de confiance du back-office (30 j, B-13+) |
| `PUSH_PROVIDER`, `FIREBASE_SERVICE_ACCOUNT_JSON`, `FIREBASE_SERVICE_ACCOUNT_FILE` | non / mode fcm | Push : `log` (dev) ou `fcm` (Firebase Admin SDK, compte de service en JSON ou chemin de fichier, chargé au premier envoi) |
| `PUSH_DAILY_CAP`, `PUSH_QUEUE_ENABLED`, `PUSH_BATCH_SIZE` | non | Plafond de push par utilisateur et par jour (2) ; file BullMQ `push` et worker dans ce processus (`false` = envoi en ligne, tests) ; taille des lots de campagne (500) |
| `SUPPORT_CONTACT_DAILY_LIMIT` | non | Demandes de contact par utilisateur et par jour (5) |
| `BILLING_VERIFIER` | non | Vérification des achats Google Play : `fake` (dev et tests, jetons `fake:<productId>:<nonce>`, refusé si `NODE_ENV=production`) ou `google` (Play Developer API) |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`, `GOOGLE_PLAY_SERVICE_ACCOUNT_FILE`, `GOOGLE_PLAY_PACKAGE_NAME` | mode google | Compte de service lié à la Play Console (JSON en une ligne ou fichier) et package Android |
| `GOOGLE_RTDN_AUTH_TOKEN` | non | Jeton exigé par `POST /webhooks/google-rtdn` (`?token=` ou bearer) ; vide = aucun contrôle |
| `BONUS_VALIDITY_DAYS` | non | Validité par défaut des pièces bonus (30 j), reprise dans `monetization_settings.bonus_validity_days` |
| `AD_PROVIDER`, `AD_SSV_FAKE_SECRET`, `ADMOB_REWARDED_UNIT_ID`, `ADMOB_SSV_KEYS_URL` | non | Pub récompensée (S08-BE-03) : vérificateur SSV `fake` (dev et tests, HMAC, refusé en production) ou `admob` (ECDSA, clés publiques Google en cache 24 h) ; bloc d'annonce renvoyé par `GET /ads/eligibility` |
| `MOBILE_MONEY_PROVIDER`, `MOBILE_MONEY_FAKE_SECRET`, `CINETPAY_API_KEY`, `CINETPAY_SITE_ID`, `CINETPAY_SECRET`, `CINETPAY_BASE_URL` | non / mode cinetpay | Recharge mobile money (S09-BE-01/02) : `fake` (page de paiement simulée, dev) ou `cinetpay` (API CinetPay, webhook HMAC) |
| `TOPUP_PUBLIC_BASE_URL`, `TOPUP_RETURN_URL` | non | Base publique de l'API (URL de notification du webhook, page de paiement simulée) ; retour du site de recharge après paiement |
| `WELCOME_OFFER_ACTIVE`, `WELCOME_OFFER_BONUS_PERCENT`, `WELCOME_OFFER_HOURS` | non | Offre de bienvenue (M-24, B-07) : valeurs initiales de `monetization_settings`, modifiables ensuite par `PUT /admin/offers/welcome` |
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
| `auth/` | `POST /auth/guest`, `POST /auth/refresh` (rotation, détection de réutilisation), garde JWT globale ; `POST /auth/google` (`identity/google-token.verifier.ts`), `/auth/otp/request` + `/verify` (`otp/`, port `SmsProvider` dans `sms/`), `/auth/email/register` + `/login` (Argon2id), `/auth/logout` ; rattachement / fusion de l'invité (`identity/identity-auth.service.ts`, `account-merge.service.ts`) ; limites de débit | Fait (S02-BE-01, S05-BE-01 à 03) |
| `media/` | Port `MediaUrlSigner` (`MEDIA_URL_SIGNER`) : `plain` et `hmac` ; signe `manifestUrl` de `/play` et `previewUrl` de `/feed` | Fait (S04-BE-02) |
| `catalog/` | `GET /home` (construit par `HomeService` à partir de la configuration B-05), `/series`, `/series/{id}`, `/series/{id}/episodes` (pistes de sous-titres), `/feed` (extrait signé, épisode, `isFavorite`), `/search` et `/search/suggest` (`SearchService`, plein texte PostgreSQL), `GET /rankings?period&genre` (`RankingsService`, spectateurs distincts, cache 10 min), `GET /genres?lang` (libellés localisés) ; `PersonalizationService` (`isFavorite` / `likes` après cache) ; calcul des droits (`EntitlementService`) ; en-têtes `X-Country` / `Accept-Language` | Fait (S04-BE-03, S05-BE-06, M-04, DEF-012) |
| `playback/` | `POST /episodes/{id}/play` (URL signée et `expiresAt`, territoire comme le catalogue, déblocage automatique `unlocked: true` ou 403 `EPISODE_LOCKED { coinCost, balance, canAutoUnlock }`, VIP enregistré), `PUT /progress` (403 sur épisode verrouillé) | Fait (S04-BE-02, S07-BE-03, DEF-003/004) |
| `users/` | `GET/PATCH/DELETE /me`, `POST /me/delete/cancel`, `GET /me/favorites`, `PUT/DELETE /me/favorites/{seriesId}`, `POST/DELETE /series/{id}/like` ; `AccountDeletionService` (anonymisation) | Fait (S05-BE-04, S05-BE-05) |
| `push/` | Port `PushProvider` (`log`, `fcm`) ; `PUT/DELETE /me/devices/push`, `GET /me/notifications`, `POST /me/notifications/{id}/read` ; `PushService.notify()` (historique in-app + push, plafond quotidien Redis) ; `NewEpisodeNotifier` (nouvel épisode d'une série suivie, regroupé par série et par heure) ; `CampaignSenderService` (segments SQL, lots de 500) ; file BullMQ `push` | Fait (M-54, S06-BE-01) |
| `help/` | `GET /help/faq?lang`, `POST /help/contact` (5/jour), `GET /help/tickets` ; back-office `/admin/faq` (EDITOR, SUPPORT, ADMIN) et `/admin/support/tickets` (SUPPORT, ADMIN) ; réponse du support → notification `support_reply` | Fait (M-53, S06-BE-02, B-03bis) |
| `analytics/` | `POST /events` (plan de marquage §13, 50 événements max, `params` ≤ 2 Ko) → `analytics_events` | Fait (S06-BE-03) |
| `jobs/` | `SchedulerService` (un passage par minute, verrou Redis) : `PublishSchedulerService` (B-04, invalidation du cache quand une date de publication est atteinte), anonymisation des comptes échus, campagnes programmées, expiration des pièces bonus (`bonus-expiry`) | Fait |
| `wallet/` | `GET /wallet` (`purchased`, `bonus`, `total`, `autoUnlock`, `bonusExpiring`), `GET /wallet/transactions?page&pageSize&type` ; `WalletService` = seul point d'écriture de `coin_ledger` (verrou `wallets FOR UPDATE`, projection recalculée depuis le grand livre, lots bonus consommés du plus proche de l'expiration au plus lointain, lignes EXPIRY par la tâche `bonus-expiry`, ajustements manuels audités) | Fait (S07-BE-01, S07-BE-04) |
| `unlock/` | `POST /episodes/{id}/unlock` (une transaction : débit + `unlocks`, idempotent, 402 `INSUFFICIENT_COINS`, `free` / `vip` sans débit), `GET /series/{id}/unlocks`, `GET /series/{id}/unlock-all/quote` et `POST /series/{id}/unlock-all` (remise `seriesUnlockDiscountPercent`, M-23) ; `UnlockService.unlock()` partagé avec le déblocage automatique de `/play` et avec `ads/` (méthode `ad`) | Fait (S07-BE-02, S07-BE-03, S10-BE-02) |
| `ads/` | Pub récompensée (M-22) : `GET /ads/eligibility`, `POST /ads/sessions` (10 min, `customData`), `GET/POST /ads/reward` (callback SSV, port `AdSsvVerifier` `fake` HMAC / `admob` ECDSA avec les clés publiques Google en cache 24 h), `GET /ads/sessions/{id}` ; plafond quotidien Redis `ads:cap:<user>:<jour>`, jour civil du fuseau du pays | Fait (S08-BE-03) |
| `monetization/` | `GET /shop` (devise par `X-Country` : XOF, NGN, GHS, EUR, repli USD) ; back-office `/admin/monetization/settings`, `/packs` (+ `/order`), `/vip-plans`, `/admin/rewards/checkin` (MONETIZATION, ADMIN) ; `MonetizationSettingsService` (ligne unique `monetization_settings`, défauts appliqués à la création des séries et des comptes, plus l'offre de bienvenue) | Fait (B-06, B-08, S07-BE-05) |
| `offers/` | Offres (M-24, B-07) : `GET /offers` (bienvenue + limitées), `POST /promo/redeem` ; back-office `GET/PUT /admin/offers/welcome`, `GET/POST/PATCH/DELETE /admin/offers/limited`, `GET/POST/PATCH /admin/promo-codes` + `/{id}/redemptions` ; `OffersService.purchaseBonus()` appelé par `billing/` et `topup/` au crédit d'un achat | Fait (S10-BE-03) |
| `billing/` | `POST /billing/google/verify` (`inapp` → lignes PURCHASE + BONUS, `subs` → `subscriptions` + `users.vip_expires_at`, acquittement, idempotent par `purchaseToken`, 409 `PURCHASE_OWNED_BY_OTHER`), `GET /me/subscription`, `POST /webhooks/google-rtdn` (Pub/Sub, renouvellement / annulation / pause / remboursement → lignes REFUND) ; port `PurchaseVerifier` `fake` (dev, tests) / `google` (Play Developer API v3 via `google-auth-library`) ; mobile money : `topup/` | Fait (S07-BE-06, S07-BE-07) |
| `topup/` | Recharge mobile money (M-34, S09-BE-01/02) : `POST /topup/orders` (prix de la boutique, `paymentUrl`), `GET /topup/orders/{id}` et `?page`, `GET /topup/fake/{orderId}` (page HTML française, boutons Payer / Échouer), `POST /webhooks/mobile-money/{provider}` (crédit idempotent par commande et par référence agrégateur) ; port `MobileMoneyProvider` `fake` / `cinetpay` (HMAC-SHA256) ; tâches planifiées `topup-expiry` (PENDING > 1 h → EXPIRED) et `topup-reconciliation` (quotidienne) ; `GET /admin/topup/reconciliation?date` (MONETIZATION, ADMIN) | Fait (S09-BE-01, S09-BE-02) |
| `rewards/` | Check-in quotidien (M-40) : `GET/POST /rewards/checkin` (barème sur 7 jours, jour civil du fuseau du pays, `409 CHECKIN_ALREADY_CLAIMED`) ; tâches (M-41) : `GET /rewards/tasks`, `POST /rewards/tasks/{id}/claim` (progression serveur : `watch_progress`, appareils push, événements `share` / `push_permission_granted`, favoris, profil) ; back-office `GET /admin/rewards/tasks` + `PATCH …/{key}` (B-08) | Fait (S08-BE-04) |
| `admin/auth/` | `POST /admin/auth/login` (Argon2id) → `POST /admin/auth/totp/verify` (TOTP obligatoire, enrôlement à la première connexion) → JWT admin ; `GET /me`, `POST /logout` (liste de révocation Redis) ; appareils de confiance 30 j (`rememberDevice`, `deviceToken`, `GET/DELETE /admin/auth/devices` avec `current`) ; `AdminAuthGuard` + `@Roles()` | Fait (S03-BE-04, B-13+) |
| `admin/series/` | CRUD séries, publication (409 sans épisode READY), archivage, règles de rôle sur la monétisation | Fait (S03-BE-01) |
| `admin/episodes/` | Épisodes (numérotation auto, réordonnancement, suppression), URL d'upload pré-signée, `/uploaded`, `/retranscode`, `POST /admin/uploads/presign` (affiches) | Fait (S03-BE-02) |
| `admin/subtitles/` | `GET/POST /admin/episodes/{id}/subtitles` (multipart `.srt` / `.vtt`, 2 Mo, conversion WebVTT, une piste par langue), `DELETE /admin/subtitles/{id}` | Fait (S03-BE-03) |
| `admin/home/` | Bannières et rangées de l'accueil (`/admin/home/banners`, `/admin/home/rows`, `…/order`), `GET /admin/home/preview` | Fait (B-05, S04-BE-01) |
| `admin/accounts/` | `GET/POST /admin/accounts`, `PATCH /admin/accounts/{id}`, `reset-totp`, `reset-password`, `revoke-devices`, `GET /admin/audit-logs` (rôle ADMIN) | Fait (B-13) |
| `admin/schedule/` | `GET /admin/schedule?from&to` : séries et épisodes à publier dans la fenêtre (`willBeVisible`) | Fait (B-04) |
| `admin/stats/` | `GET /admin/stats/overview?days` : actifs 1/7/30 j, nouveaux, inscrits, invités, épisodes commencés / terminés, top séries, `paywallViews`, `unlocks` (0), `pushOpens` ; cache 5 min | Fait (B-11 v0) |
| `admin/campaigns/` | `GET/POST /admin/campaigns`, `GET/PATCH/DELETE /admin/campaigns/{id}`, `/estimate`, `/send`, `/cancel` (MONETIZATION, ADMIN) ; campagnes programmées envoyées par le `SchedulerService` | Fait (B-10) |
| `admin/users/` | `GET /admin/users?q` (identifiant, e-mail, téléphone, nom), `GET /admin/users/{id}` (profil, portefeuille, abonnement, déblocages, achats, grand livre), `POST /{id}/coins` (ligne ADJUSTMENT, motif obligatoire, audit avant / après), `POST /{id}/block` / `/unblock` (SUPPORT, ADMIN) | Fait (B-09) |
| `admin/audit/` | `AuditService` : auteur, action, cible, ancienne / nouvelle valeur, IP pour chaque mutation | Fait |
| `openapi/` | Construction du document Swagger v1 (`/docs`, `/docs-json`, `/docs-yaml`) | Fait |
| `generated/prisma/` | Client Prisma généré — **ne pas modifier, ignoré par git** | — |

Chaque méthode encore planifiée porte un `TODO <ticket>` et répond `501 NOT_IMPLEMENTED` ; elle est documentée dans `/docs` avec ses DTO (OpenAPI v1, S02-BE-03).

### Authentification

1. `POST /auth/guest` au premier lancement → `user` + `tokens` (`accessToken` JWT 15 min, `refreshToken` opaque 30 j).
2. Toutes les routes non publiques exigent `Authorization: Bearer <accessToken>` ; les routes du catalogue sont publiques mais se personnalisent si un jeton est présent.
3. `POST /auth/refresh` renvoie une nouvelle paire et révoque l'ancien jeton. Réutiliser un jeton révoqué révoque toute la famille (`401 REFRESH_TOKEN_REUSED`).
4. Connexion (contrat public v1.2, M-51) : `POST /auth/google { idToken, deviceId }`, `POST /auth/otp/request { phone }` → `{ requestId, expiresIn, resendAfter }` puis `POST /auth/otp/verify { requestId, code, deviceId }`, `POST /auth/email/register` (201) et `/auth/email/login { email, password, deviceId }`. Réponse `AuthSession { accessToken, refreshToken, expiresIn, user: UserDto, linked }` ; `POST /auth/logout { refreshToken }` → 204.
5. Rattachement du compte invité (M-50) : si l'appel porte le jeton d'un invité, identité inconnue → l'invité devient `REGISTERED` en place (historique, progression, favoris, déblocages, portefeuille conservés) ; identité déjà liée à un autre compte → fusion de l'invité dans ce compte en une transaction (progression : position la plus avancée ; favoris, « J'aime », déblocages : union ; achats rattachés ; solde transféré par deux lignes `ADJUSTMENT` par bucket ; invité `MERGED`, jetons révoqués ; entrée d'audit `user.merge`). `linked=true` dans les deux cas.
6. OTP : code à 6 chiffres, 5 min, 5 essais (`410 OTP_TOO_MANY_ATTEMPTS`), renvoi après 60 s (`429 OTP_RESEND_TOO_SOON`), 3 demandes par numéro et 15 min. `SMS_PROVIDER=console` (dev) : le code est dans les logs (`[SMS] [console] to +228…`) et dans Redis `otp:<requestId>` (`docker exec drama-redis redis-cli GET otp:<requestId>`). Google : `GOOGLE_CLIENT_IDS` vide → `503 GOOGLE_AUTH_DISABLED` ; jeton invalide → `401 GOOGLE_TOKEN_INVALID`. E-mail : `409 EMAIL_TAKEN`, `401 INVALID_CREDENTIALS`.
7. Compte (`/me`, S05-BE-04) : `PATCH { displayName?, language?, country?, notificationPreferences?, autoUnlock? }` ; `DELETE` → `202 { scheduledFor }` (statut `DELETION_PENDING`, jetons révoqués, anonymisation 30 jours plus tard par la tâche planifiée : e-mail, téléphone, identités, favoris, progression effacés, nom « Utilisateur supprimé », grand livre et achats conservés) ; `POST /me/delete/cancel` après reconnexion dans le délai.

### Lecture signée (S04-BE-02)

`POST /episodes/{id}/play` et `GET /feed` passent par le port `MediaUrlSigner` : `MEDIA_SIGNER=plain` (dev MinIO : URL publique, `expiresAt` = maintenant + `PLAYBACK_URL_TTL_SECONDS`) ou `hmac` (`?token=<base64url(hmac-sha256(MEDIA_SIGNING_KEY, chemin du dossier du manifeste + expires))>&expires=<epoch>`, compatible avec l'authentification par jeton des CDN de type Bunny / KeyCDN configurés sur le même secret). Vignettes, affiches et sous-titres ne sont pas signés. **Ne pas activer `hmac` en dev avec MinIO** : il ignore le jeton mais le téléphone doit continuer à lire ; tester sur une configuration à part (`MEDIA_SIGNER=hmac MEDIA_SIGNING_KEY=… PORT=3999 node dist/main.js`).

### Favoris, « J'aime » et recherche (S05-BE-05, S05-BE-06)

- `GET /me/favorites?page&pageSize`, `PUT` / `DELETE /me/favorites/{seriesId}` (204, idempotents), `POST` / `DELETE /series/{id}/like` → `{ likes, liked }` (`series.likes_count` est la projection de la table `likes`, mise à jour dans la même transaction). Avec un jeton, tout `SeriesSummary` (accueil, listes, fiche, flux, recherche) porte `isFavorite` et `likes`, calculés après le cache.
- `GET /search?q&genre&page&pageSize` → `{ items, total, page, pageSize, suggestions }`, `GET /search/suggest?q` → `{ suggestions }` (titres par préfixe, 8 max). Colonne `series.search_vector` (titre A, tags et genres B, synopsis C ; dictionnaires `french` + `simple`, extension `unaccent` via `f_unaccent()`), maintenue par le trigger `series_search_vector_refresh`, index GIN ; requête `websearch_to_tsquery('french')` + préfixes `simple`, classement `ts_rank_cd` ; séries publiées (date atteinte) et autorisées sur le territoire (`X-Country`).

### Publication programmée et tableau de bord (B-04, B-11 v0)

- `PATCH /admin/series/{id}` et `PATCH /admin/episodes/{id}` acceptent un `publishedAt` futur ; le catalogue public (`publishedSeriesWhere` / `visibleEpisodeWhere`) ignore ce dont la date n'est pas atteinte. `SchedulerService` (toutes les 60 s, verrou Redis `lock:job:*`, `SCHEDULER_ENABLED`) invalide le cache des séries concernées quand la date arrive (notifications push : à brancher en M-54). `GET /admin/schedule?from&to` liste séries et épisodes datés dans la fenêtre (30 jours par défaut, 366 max) avec `willBeVisible`.
- `GET /admin/stats/overview?days=7` → `{ activeUsers: { d1, d7, d30 }, newUsers, registeredUsers, guestUsers, episodesStarted, episodesCompleted, topSeries: [{ seriesId, title, viewers, completions }], days, generatedAt }`, agrégats SQL sur `users` et `watch_progress`, cache Redis 5 min (`cache:v1:admin:stats:overview:<days>`). Lecture pour tous les rôles.

### Notifications push, centre d'aide et événements (contrat `docs/api/contract-v1.3-sprint5.md`)

- **Appareil de confiance (B-13+)** : `POST /admin/auth/totp/verify { rememberDevice: true }` renvoie `deviceToken` (256 bits aléatoires, stocké haché SHA-256 dans `admin_trusted_devices`, 30 jours) et `deviceTokenExpiresAt`. `POST /admin/auth/login { deviceToken }` ouvre directement la session (`status: "ok"`) si le jeton est valide pour ce compte et que le TOTP est enrôlé ; sinon flux TOTP habituel (jeton invalide ignoré). `GET /admin/auth/devices`, `DELETE /admin/auth/devices/{id}`, `POST /admin/accounts/{id}/revoke-devices` (ADMIN). La réinitialisation du TOTP et la désactivation d'un compte révoquent tous ses appareils. Audit : `admin.device_trusted`, `admin.device_revoked`, `admin.login` (`method: password+device`), `admin_account.revoke_devices`.
- **Push (M-54)** : `PUT /me/devices/push { token, platform: "android", locale, appVersion }` (upsert par jeton, rattaché au compte courant), `DELETE /me/devices/push/{token}`, `GET /me/notifications?page&pageSize` (`items[{ id, type, title, body, data, sentAt, readAt }]`, `unreadCount`), `POST /me/notifications/{id}/read`. Fournisseur `PUSH_PROVIDER=log` (dev : ligne `[Push] [log] to …` dans les logs, remise `SENT` dans `push_deliveries`) ou `fcm`. Déclencheur « nouvel épisode d'une série suivie » dans `TranscodeService.markReady` et `PublishSchedulerService` : favoris de la série, préférence `newEpisodes` ≠ false, une notification par série et par heure (clé Redis `push:new_episode:<seriesId>:<heure>`), plafond `PUSH_DAILY_CAP` push par utilisateur et par jour (clé `push:cap:<userId>:<jour>`, toutes causes), jetons invalides supprimés.
- **Campagnes (B-10)** : `Campaign { id, title, body, deepLink?, segment: { type: ALL|COUNTRY|SERIES_FOLLOWERS|INACTIVE, countries?, seriesId?, inactiveDays? }, scheduledAt?, status: DRAFT|SCHEDULED|SENDING|SENT|CANCELLED, audienceCount, sentCount, createdBy, createdAt }`. L'audience = comptes `ACTIVE` avec au moins un appareil et `offers` ≠ false ; `INACTIVE` compare `GREATEST(last_seen_at, max(watch_progress.updated_at))` à N jours. `POST /send` : job BullMQ `push` (lots de `PUSH_BATCH_SIZE`), ou `SCHEDULED` si `scheduledAt` est futur (tâche `campaign-scheduler` du planificateur). `POST /cancel` arrête l'envoi au lot suivant.
- **Centre d'aide (M-53)** : `GET /help/faq?lang` (publiées, groupées par catégorie `account|coins|vip|playback|payment|content|other`, textes `{ fr, en, es, pt }` avec repli fr, cache 5 min par langue), `POST /help/contact { subject, message, email?, category }` → `201 { ticketId }` (5 par jour par utilisateur, clé Redis `rl:help_contact:user:<id>:<jour>`, `429 RATE_LIMITED` ; confirmation e-mail journalisée `[MAIL] [console]` faute de service d'e-mail au MVP), `GET /help/tickets`. Back-office : `/admin/faq` (+ `PUT /admin/faq/order`), `/admin/support/tickets?status&page`, `/{id}`, `/{id}/reply { message }` (statut `ANSWERED`, notification `support_reply` + push), `/{id}/close`.
- **Événements (S06-BE-03)** : `POST /events { events: [{ name, params?, at }], sessionId?, appVersion? }` → `202 { accepted }`, jeton facultatif, `X-Country` ; noms limités à `app_open, series_view, episode_start, episode_complete, paywall_view, unlock, purchase, subscription_start, ad_reward, checkin, push_open, login, signup, share, search` ; `params` ≤ 2 Ko (`400 EVENT_PARAMS_TOO_LARGE`) ; horodatage borné à ±7 jours ; 120 appels/min par IP. `GET /admin/stats/overview` ajoute `paywallViews`, `unlocks` (0 jusqu'au déblocage), `pushOpens`.

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

Fenêtres fixes Redis (`rl:*`), 429 `RATE_LIMITED` au format `ApiErrorDto` avec `Retry-After` : `/admin/auth/login` 5 / e-mail / 15 min et 20 / IP / 15 min ; `/admin/auth/totp/verify` 30 / IP ; `/auth/guest` 30 / IP ; `/auth/refresh` 120 / IP ; `/auth/google` 30 / IP ; `/auth/otp/request` 3 / numéro et 10 / IP ; `/auth/otp/verify` 20 / IP ; `/auth/email/register` 10 / IP ; `/auth/email/login` 10 / e-mail et 30 / IP (toutes par 15 min). Si Redis est indisponible la requête passe (fail-open, journalisé) ; `RATE_LIMIT_ENABLED=false` désactive tout.

### Observabilité (S02-OPS-02)

- `GET /metrics` (Prometheus, exclu de Swagger) : métriques Node (`drama_process_*`, `drama_nodejs_*`), `drama_http_request_duration_seconds{method,route,status_code}`, `drama_transcode_jobs_total{status,provider}`, `drama_transcode_job_duration_seconds`, `drama_transcode_active_jobs`. Endpoint interne : ne pas l'exposer par le reverse proxy, ou définir `METRICS_TOKEN`.
- Sentry : `SENTRY_DSN` renseigné → initialisation au démarrage et capture des 5xx (avec `requestId`, méthode, chemin, code).
- Pile Prometheus + Grafana (tableau de bord latence / erreurs / transcodage) : `docker compose -f infra/docker-compose.monitoring.yml up -d` (voir `infra/README.md`).

### Format des erreurs

Toutes les erreurs suivent `ApiErrorDto` : `{ statusCode, code, message, details?, path, timestamp, requestId }`. Le champ `code` est stable (`VALIDATION_ERROR`, `UNAUTHENTICATED`, `EPISODE_LOCKED`, `SERIES_NOT_FOUND`, ...) et destiné à la localisation côté application. L'en-tête `x-request-id` est renvoyé sur chaque réponse.

### Récompenses, pub récompensée, série entière, offres et recharge mobile money (sprint 7, contrat v1.5)

1. **Check-in quotidien (M-40)** : `GET/POST /rewards/checkin`. Jour civil dans le fuseau du pays (`common/time/local-day.ts` : TG/CI/SN/BJ/BF/ML/NE/GH/NG → `Africa/…`, sinon UTC) ; barème sur 7 jours (`monetization_settings.checkin_days`), `checkinResetOnMiss` remet la série à 1 après un jour manqué ; idempotent par `(user, day)` (table `checkin_claims`) ; crédit = ligne BONUS via `WalletService.creditBonus()`. Déjà réclamé aujourd'hui → `409 CHECKIN_ALREADY_CLAIMED { nextClaimAt }`.
2. **Tâches (M-41)** : `GET /rewards/tasks`, `POST /rewards/tasks/{id}/claim`. Clés fixes (`reward_tasks`, seedées) : `watch_3_episodes` (jour), `watch_10_episodes` (semaine ISO), `enable_notifications`, `share_series`, `complete_profile`, `add_favorite` ; progression calculée côté serveur (`watch_progress.completed`, `push_devices` ou événement `push_permission_granted`, événement `share`, profil `displayName`/`language`/`country`, `favorites`) ; une réclamation par `(user, task, période)` (`reward_task_claims`) ; back-office `GET /admin/rewards/tasks` + `PATCH …/{key}` (MONETIZATION, ADMIN).
3. **Pub récompensée (M-22)** : `GET /ads/eligibility?episodeId`, `POST /ads/sessions` (10 min, `customData` = `sessionId:nonce`), `GET|POST /ads/reward` (callback SSV de la régie, jamais de l'app), `GET /ads/sessions/{id}`. Port `AdSsvVerifier` (`AD_PROVIDER=fake|admob`) : `admob` vérifie une signature ECDSA P-256 avec les clés publiques Google (`ADMOB_SSV_KEYS_URL`, cache 24 h, rechargées sur `key_id` inconnu) ; `fake` (dev et tests, refusé en production) vérifie un HMAC-SHA256 de `AD_SSV_FAKE_SECRET` sur la chaîne de requête signée (tout ce qui précède `&signature=`). Succès → déblocage `method: ad` sans débit (`UnlockService.recordWithoutDebit`) + compteur quotidien Redis `ads:cap:<user>:<jour>` (repli : comptage en base) comparé à `monetization_settings.adDailyCap` ; série non éligible si `series.adUnlockEnabled = false` (défaut vrai).
4. **Déblocage de série entière (M-23)** : `GET /series/{id}/unlock-all/quote` → `{ lockedCount, fullPrice, discountPercent, price }` (`seriesUnlockDiscountPercent`, arrondi au supérieur) ; `POST /series/{id}/unlock-all` : une transaction (verrou du portefeuille, création de tous les `unlocks` restants, une ligne de débit par lot bonus consommé puis une PURCHASED via `WalletService.debit()`), idempotente par `idempotencyKey`.
5. **Offres (M-24, B-07)** : `GET /offers` (bienvenue + limitées actives), `POST /promo/redeem`. Offre de bienvenue : bonus en % sur le premier achat (aucun `purchases` crédité) dans les `welcomeOfferHours` suivant la création du compte, appliqué par `OffersService.purchaseBonus()` au crédit (Google Play **et** mobile money) ; offres limitées : bonus % sur un pack pendant une fenêtre, cumulé avec la bienvenue ; codes promo : majuscules, `promo_codes` verrouillée (`SELECT … FOR UPDATE`) à la réclamation, compteurs `usesCount`/`maxUses`/`perUserUses`, crédit BONUS idempotent par `(user, idempotencyKey)`. Back-office : `GET/PUT /admin/offers/welcome`, `GET/POST/PATCH/DELETE /admin/offers/limited`, `GET/POST/PATCH /admin/promo-codes` + `/{id}/redemptions`.
6. **Recharge mobile money (M-34, §10)** : `POST /topup/orders` (prix du pack dans la devise du pays), `GET /topup/orders/{id}` et `?page`, `POST /webhooks/mobile-money/{provider}` (crédit idempotent par commande **et** par référence agrégateur, jamais sur simple signal de l'app ou du site). Port `MobileMoneyProvider` (`MOBILE_MONEY_PROVIDER=fake|cinetpay`) : `fake` sert `GET /topup/fake/{orderId}` (page HTML française, boutons Payer / Échouer qui postent un webhook JSON signé `X-Fake-Signature: sha256=<HMAC-SHA256(MOBILE_MONEY_FAKE_SECRET, corps brut)>`, exerçant toute la chaîne) ; `cinetpay` initialise le paiement (`POST /v2/payment`) et vérifie la notification par le jeton `x-token` (HMAC-SHA256 des champs `cpm_*` concaténés, `CINETPAY_SECRET`) avant de confirmer par `POST /v2/payment/check`. Tâches planifiées : `topup-expiry` (commandes `PENDING` au-delà d'1 h → `EXPIRED`) et `topup-reconciliation` (quotidienne, verrou Redis) ; `GET /admin/topup/reconciliation?date` compare les commandes payées du jour aux lignes PURCHASE du grand livre (MONETIZATION, ADMIN).
7. **Classements et genres (M-04, DEF-012)** : `GET /rankings?period=day|week|all&genre=` (spectateurs distincts sur `watch_progress`, séries publiées et autorisées sur le territoire, cache 10 min, `isFavorite`/`likes` ajoutés après le cache) ; `GET /genres?lang` (libellés localisés fr/en/es/pt pour romance, drame, comédie, action, thriller, fantastique, famille, `common/i18n/genre-label.ts`) ; `SeriesSummary.genres` reste la liste des clés.

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

- **Unitaires** (`npm test`) : services avec Prisma, Redis, S3 et ffmpeg simulés (`vi.fn()`). Couverts : santé, auth (création invité, rotation, réutilisation), signature `hmac` / `plain` des URLs média, vérificateur Google (simulé), cycle de vie OTP (Redis simulé), règles de rattachement et de fusion (lignes de grand livre, portefeuilles, union des favoris / déblocages, audit), profil et suppression différée, préparation des requêtes de recherche, tâche de publication programmée, forme du tableau de bord, catalogue (cache par pays, recalcul de l'accès après cache), constructeur de l'accueil (types de rangées, classement Tendances, filtre pays, choix de la langue, « Continuer à regarder » hors cache), classements (M-04, filtre genre, cache), cache et invalidation, conversion SRT → VTT (BOM, CRLF, numéros, horodatages), `Accept-Language` / `X-Country` / libellés de langues / libellés de genres localisés (DEF-012), TOTP (vecteurs RFC 6238) et chiffrement, auth admin (enrôlement, vérification, révocation) et garde de rôles, séries (règle de publication, règles de rôle, journal d'audit), épisodes (numérotation, renumérotation, upload), règles de la mise en avant (genre / séries requis, fenêtre, ordre), comptes internes (auto-verrouillage, dernier admin, politique de mot de passe, filtres du journal), pipeline de transcodage (ffmpeg simulé, succès / échec), signature des webhooks, garde de limitation de débit, jour civil et série du check-in dans le fuseau du pays, progression des tâches récompensées, signature SSV `fake` et `admob` (paire de clés ECDSA générée pour le test), tarification du déblocage de série entière, offre de bienvenue et offres limitées, règles des codes promo, machine à états de la recharge mobile money (`fake` et `cinetpay` simulés), réconciliation.
- **E2E** (`npm run test:e2e`) : montent l'application complète sur `DATABASE_URL` (migrations appliquées), Redis et MinIO ; `test/app.e2e-spec.ts` (santé, auth invité, catalogue, `/docs-json`), `test/admin.e2e-spec.ts` (connexion 2FA complète, révocation, 429, CRUD séries et épisodes, PUT réel sur l'URL pré-signée, `/uploaded`, webhook signé → READY → publication, `/metrics`) et `test/admin-sprint3.e2e-spec.ts` (import SRT réel → VTT lu sur MinIO avec en-tête `Origin`, exposition sur `/episodes` et `/play`, configuration de l'accueil → `GET /home` par pays et langue avec invalidation du cache, comptes internes, `reset-totp`, journal d'audit) et `test/sprint4.e2e-spec.ts` (OTP avec code lu dans Redis, inscription e-mail rattachant l'invité, fusion de deux comptes avec transfert du solde, favoris et « J'aime », recherche, `/me` avec suppression différée, annulation et anonymisation, déconnexion, lecture signée `hmac` vérifiée sur une seconde application, publication programmée et bascule par la tâche planifiée, tableau de bord, OpenAPI 1.2.0) et `test/sprint7.e2e-spec.ts` (check-in deux fois → 409, tâche réclamée via une progression réelle, session de pub → callback SSV simulé signé → épisode débloqué et plafond atteint, déblocage de série entière idempotent, code promo réclamé deux fois, commande de recharge → page simulée → webhook → portefeuille crédité une seule fois, classements, genres localisés). Le fournisseur de transcodage y est forcé en `webhook` ; le pipeline ffmpeg réel est couvert par `scripts/smoke-ingest.ts`. Les lignes créées sont supprimées en fin de test.

## Intégration continue

`.github/workflows/backend-ci.yml` : sur tout push/PR touchant `backend/**` — Node 24, ffmpeg, `npm ci`, `prisma validate` + `generate`, lint, tests unitaires, build, migrations sur un PostgreSQL de service, tests e2e (PostgreSQL, Redis et MinIO de service, `TRANSCODE_PROVIDER=webhook`), export OpenAPI v1 et vérification que `docs/api/openapi.v1.json` est à jour.
