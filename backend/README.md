# DRAMA — Backend API

API REST du MVP de micro-séries verticales : monolithe modulaire **NestJS 12** (TypeScript, ESM) sur **PostgreSQL 16** (Prisma 7) et **Redis 7**. Documentation OpenAPI servie sur `/docs`.

Référence fonctionnelle : `docs/Cahier des charges — Application de micro-séries verticales (Android).md` (§8 backend). Tickets Sprint 1 : S01-BE-01 (squelette, config, healthcheck, Swagger), S01-BE-02 (modèle de données et migration initiale), S01-BE-03 (OpenAPI v0.1).

## Prérequis

- Node.js **24** et npm 11 (voir `engines` dans `package.json`).
- Docker avec `docker compose` pour PostgreSQL, Redis et MinIO : `docker compose -f infra/docker-compose.dev.yml up -d` depuis la racine (détails dans `infra/README.md`).

## Démarrage rapide

```bash
cd backend
cp .env.example .env            # valeurs par défaut alignées sur infra/docker-compose.dev.yml
npm install                     # installe les dépendances et génère le client Prisma (postinstall)
npm run prisma:deploy           # applique les migrations
npm run db:seed                 # 1 compte admin, 1 série publiée (3 épisodes), 1 série brouillon
npm run dev                     # http://localhost:3000 — Swagger : http://localhost:3000/docs
```

Vérification : `curl -s localhost:3000/health | jq` doit renvoyer `"status": "ok"` avec `database` et `redis` à `up`.

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
| `npm run openapi:export` | Écrit `docs/api/openapi.v0.1.json` sans ouvrir de port |

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
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | non | Compte admin créé par le seed |

## Carte des modules (`src/`)

| Dossier | Rôle | État Sprint 1 |
| --- | --- | --- |
| `config/` | Validation zod de l'environnement, `AppConfig` injectable | Fait |
| `prisma/`, `redis/` | Connexions partagées (modules globaux) | Fait |
| `common/` | Décorateurs `@Public()` / `@CurrentUser()`, filtre d'exceptions (`ApiErrorDto`), journal des requêtes, erreurs normalisées | Fait |
| `health/` | `GET /health` (PostgreSQL + Redis, 503 si dégradé), `GET /health/live` | Fait |
| `auth/` | `POST /auth/guest`, `POST /auth/refresh` (rotation, détection de réutilisation), garde JWT globale | Fait (Google, OTP, e-mail : S05) |
| `catalog/` | `GET /home`, `/series`, `/series/{id}`, `/series/{id}/episodes`, `/feed` ; calcul des droits (`EntitlementService`) | Fait sur données réelles (rangées paramétrées, cache : S04) |
| `playback/` | `POST /episodes/{id}/play` (403 `EPISODE_LOCKED`), `PUT /progress` | Fait ; URL signée : S04-BE-02 |
| `unlock/` | `POST /episodes/{id}/unlock`, `POST /ads/reward` | Squelette (501) — S07, S08 |
| `wallet/` | `GET /wallet`, `GET /wallet/transactions` | Squelette (501) — S07 |
| `billing/` | Google Play, RTDN, mobile money | Squelette (501) — S07, S09 |
| `rewards/` | Check-in, tâches | Squelette (501) — S08 |
| `users/` | `/me`, favoris | Squelette (501) — S05 |
| `admin/` | `/admin/*` (rôles, audit) | Squelette (501) — S03 |
| `openapi/` | Construction du document Swagger (`/docs`, `/docs-json`, `/docs-yaml`) | Fait |
| `generated/prisma/` | Client Prisma généré — **ne pas modifier, ignoré par git** | — |

Les contrôleurs des squelettes sont exclus de `/docs` (`@ApiExcludeController`) tant que leur sprint n'est pas ouvert ; chaque méthode porte un `TODO <ticket>`.

### Authentification

1. `POST /auth/guest` au premier lancement → `user` + `tokens` (`accessToken` JWT 15 min, `refreshToken` opaque 30 j).
2. Toutes les routes non publiques exigent `Authorization: Bearer <accessToken>` ; les routes du catalogue sont publiques mais se personnalisent si un jeton est présent.
3. `POST /auth/refresh` renvoie une nouvelle paire et révoque l'ancien jeton. Réutiliser un jeton révoqué révoque toute la famille (`401 REFRESH_TOKEN_REUSED`).

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

- **Unitaires** (`npm test`) : services avec Prisma et Redis simulés (`vi.fn()`). Couverts en Sprint 1 : santé, auth (création invité, rotation, réutilisation), catalogue (filtres, pagination, statut des épisodes, accueil, flux).
- **E2E** (`npm run test:e2e`) : montent l'application complète sur la base de `DATABASE_URL` (migrations appliquées) et Redis ; couvrent `/health`, `/auth/guest`, `/auth/refresh`, validation, garde, catalogue anonyme, `/docs-json`. Les utilisateurs créés sont supprimés en fin de test.

## Intégration continue

`.github/workflows/backend-ci.yml` : sur tout push/PR touchant `backend/**` — Node 24, `npm ci`, `prisma validate` + `generate`, lint, tests unitaires, build, migrations sur un PostgreSQL de service, tests e2e, export OpenAPI et vérification qu'il est à jour.
