# Infra — services de développement

Ce dossier contient la pile Docker Compose locale (ticket **S01-OPS-02**) : PostgreSQL 16, Redis 7 et un stockage objet compatible S3 (MinIO).

## Démarrage

```bash
# depuis la racine du monorepo
docker compose -f infra/docker-compose.dev.yml up -d
docker compose -f infra/docker-compose.dev.yml ps        # tous les services doivent être "healthy"
docker compose -f infra/docker-compose.dev.yml logs -f    # suivre les logs
docker compose -f infra/docker-compose.dev.yml down       # arrêter (les volumes nommés sont conservés)
docker compose -f infra/docker-compose.dev.yml down -v    # arrêter ET supprimer les données
```

Le service one-shot `minio-init` s'exécute automatiquement après que MinIO est sain : il crée le bucket `drama-media` (idempotent) et lui donne une politique de lecture anonyme (`download`) : manifestes HLS, affiches et sous-titres WebVTT (`subtitles/{episodeId}/{langue}.vtt`, S03-BE-03) sont lisibles sans signature. MinIO n'accepte les requêtes navigateur (PUT direct sur URL pré-signée depuis le back-office, lecture des `.vtt` par un lecteur web) que depuis les origines de `MINIO_CORS_ORIGINS` ; le défaut est désormais `*` (lecture depuis n'importe quelle origine, les PUT restant protégés par la signature des URLs). Un conteneur créé avec l'ancien défaut (`http://localhost:3100,http://localhost:3000`) garde sa configuration tant qu'il n'est pas recréé : `docker compose -f infra/docker-compose.dev.yml up -d minio` (les données du volume sont conservées). L'application Android (Media3) n'est pas soumise au CORS. Vérification :

```bash
curl -s -i -X OPTIONS http://localhost:9000/drama-media/sources/test.mp4 \
  -H "Origin: http://localhost:3100" -H "Access-Control-Request-Method: PUT" \
  -H "Access-Control-Request-Headers: content-type" | grep -i access-control
# attendu : Access-Control-Allow-Origin: http://localhost:3100 (ou *) et Access-Control-Allow-Methods: PUT
curl -s -i http://localhost:9000/drama-media/subtitles/<episodeId>/fr.vtt -H "Origin: http://localhost:3100" | grep -i -E "content-type|access-control-allow-origin"
# attendu : Content-Type: text/vtt et Access-Control-Allow-Origin présent
```

Pour relancer l'initialisation du bucket à la main :

```bash
docker compose -f infra/docker-compose.dev.yml run --rm minio-init
```

## Services et ports

| Service | Image | Port hôte | Volume | Healthcheck |
| --- | --- | --- | --- | --- |
| `postgres` | `postgres:16-alpine` | `5432` | `postgres-data` | `pg_isready` |
| `redis` | `redis:7-alpine` (AOF activé) | `6379` | `redis-data` | `redis-cli ping` |
| `minio` | `bitnamilegacy/minio:2025.5.24-debian-12-r5` | `9000` (API S3), `9001` (console web) | `minio-data` | `GET /minio/health/live` |
| `minio-init` | idem (client `mc`) | — | — | one-shot |
| `postgres-backup` | `postgres:16-alpine` | — | `postgres-backups` | boucle `pg_dump` quotidienne |

Console MinIO : <http://localhost:9001> (identifiants ci-dessous).

> **Pourquoi l'image Bitnami ?** Les images officielles `minio/minio` et `minio/mc` ne sont plus téléchargeables anonymement depuis Docker Hub ni quay.io (constaté le 28/10/2026). L'image Bitnami « legacy » est figée (MinIO 2025.5.24) mais embarque serveur + client `mc` ; elle suffit pour le développement. En staging/production le stockage sera un service S3 managé (R2, Wasabi ou S3), voir cahier des charges §8.1.

## Variables d'environnement

Toutes les variables ont une valeur par défaut. Pour les surcharger, exporter la variable avant `docker compose` ou créer un fichier `infra/.env` (ignoré par git, voir `.gitignore` racine).

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `POSTGRES_USER` | `drama` | Utilisateur PostgreSQL |
| `POSTGRES_PASSWORD` | `drama` | Mot de passe PostgreSQL |
| `POSTGRES_DB` | `drama` | Base créée au premier démarrage |
| `POSTGRES_PORT` | `5432` | Port exposé sur l'hôte |
| `REDIS_PORT` | `6379` | Port exposé sur l'hôte |
| `MINIO_ROOT_USER` | `minioadmin` | Access key S3 / login console |
| `MINIO_ROOT_PASSWORD` | `minioadmin` | Secret key S3 / mot de passe console |
| `MINIO_PORT` | `9000` | Port API S3 |
| `MINIO_CONSOLE_PORT` | `9001` | Port console web |
| `S3_BUCKET` | `drama-media` | Bucket créé au démarrage |
| `MINIO_CORS_ORIGINS` | `*` | Origines autorisées par le CORS de l'API S3 (PUT navigateur du back-office, lecture des sous-titres VTT par les lecteurs web) |
| `BACKUP_RETENTION_DAYS`, `BACKUP_INTERVAL_SECONDS` | `14`, `86400` | Rétention et période des sauvegardes du service `postgres-backup` |
| `PROMETHEUS_PORT`, `GRAFANA_PORT` | `9090`, `3300` | Ports de la pile de supervision |
| `GRAFANA_USER`, `GRAFANA_PASSWORD` | `admin` / `admin` | Identifiants Grafana |

Valeurs correspondantes côté backend (`backend/.env.example`) :

```
DATABASE_URL=postgresql://drama:drama@localhost:5432/drama?schema=public
REDIS_URL=redis://localhost:6379
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=drama-media
```

## Accès en ligne de commande (sans client installé sur l'hôte)

```bash
docker exec -it drama-postgres psql -U drama -d drama
docker exec -it drama-redis redis-cli
docker exec -it drama-minio mc ls local/drama-media
```

## Sauvegardes PostgreSQL (S05-OPS-01)

Le service `postgres-backup` (même image que la base) exécute `scripts/backup.sh` au démarrage puis toutes les 24 h : `pg_dump -Fc` (format compressé, restaurable table par table) dans le volume nommé `postgres-backups`, fichiers `drama-<UTC>.dump`, suppression de ceux de plus de 14 jours.

```bash
docker logs -f drama-postgres-backup                           # journal des sauvegardes et purges
docker exec drama-postgres-backup ls -la /backups               # lister les sauvegardes du volume
docker compose -f infra/docker-compose.dev.yml exec postgres-backup sh /usr/local/bin/drama-backup.sh /backups   # sauvegarde immédiate
docker cp drama-postgres-backup:/backups/drama-20261030T094303Z.dump ./   # récupérer un fichier sur l'hôte
```

Depuis l'hôte (utilise `pg_dump` / `pg_restore` locaux s'ils existent, sinon le conteneur `drama-postgres`) :

```bash
infra/scripts/backup.sh ./backups                               # sauvegarde dans ./backups (ignoré par git)
infra/scripts/restore.sh ./backups/drama-<date>.dump            # restaure dans la base `drama_restore` (créée au besoin)
infra/scripts/restore.sh ./backups/drama-<date>.dump drama      # restauration dans la base de dev : ÉCRASE les données
docker exec drama-postgres psql -U drama -d drama_restore -c 'SELECT COUNT(*) FROM users'   # vérification
docker exec drama-postgres psql -U drama -d postgres -c 'DROP DATABASE drama_restore'       # ménage
```

Variables acceptées par les scripts : `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`, `BACKUP_RETENTION_DAYS`, `POSTGRES_CONTAINER`. Après une restauration dans `drama`, relancer `npm run prisma:deploy` côté backend (sans effet si la sauvegarde est au même niveau de migration).

**Staging / production (base managée)** : activer la récupération à un instant donné (PITR) du fournisseur (sauvegardes automatiques quotidiennes + archivage WAL, rétention 7 à 14 jours) et conserver en plus un `pg_dump -Fc` quotidien hors du fournisseur (stockage objet chiffré, rétention 30 jours) via ce même script dans un job planifié. Tester une restauration par trimestre dans une base de recette.

## Supervision (`docker-compose.monitoring.yml`, S02-OPS-02, S06-OPS-01)

```bash
docker compose -f infra/docker-compose.monitoring.yml up -d
# Prometheus : http://localhost:9090 (cible drama-api = host.docker.internal:3000/metrics)
# Grafana    : http://localhost:3300 (admin / admin) — dossier « DRAMA », tableau « DRAMA API — latence et erreurs »
```

- `monitoring/prometheus.yml` scrape `GET /metrics` de l'API lancée sur l'hôte toutes les 15 s (en staging, remplacer la cible par le conteneur API). Si l'API définit `METRICS_TOKEN`, décommenter le bloc `authorization` du fichier avec la même valeur.
- `monitoring/prometheus/alerts.yml` (S06-OPS-01) : règles d'alerte évaluées par Prometheus (onglet <http://localhost:9090/alerts>) : `DramaApiDown` (cible injoignable 2 min), `DramaPlaybackLatencyP95High` (p95 de `/episodes/{id}/play` et `/feed` > 300 ms pendant 5 min), `DramaApiLatencyP95High` (p95 global > 300 ms pendant 10 min), `DramaApi5xxRateHigh` (> 1 % de 5xx pendant 5 min), `DramaTranscodeFailures` (job en échec sur 30 min), `DramaQueueBacklog` (file BullMQ `transcode` ou `push` : plus ancien job > 10 min ou > 50 en attente). Validation : `docker run --rm -v $PWD/infra/monitoring/prometheus/alerts.yml:/a.yml:ro --entrypoint promtool prom/prometheus:v2.55.1 check rules /a.yml`. Le routage (e-mail, Slack) viendra avec Alertmanager au déploiement staging.
- `monitoring/grafana/provisioning/` déclare la source Prometheus et charge `monitoring/grafana/dashboards/drama-api.json` : requêtes/s par statut, taux d'erreur 5xx, latences p50/p95/p99 (filtre par route), p95 par route, transcodages READY/FAILED, jobs actifs, mémoire.
- Sentry : côté API uniquement (`SENTRY_DSN`), rien à déployer ici.
- Loki / Promtail : non inclus pour l'instant (l'API tourne sur l'hôte en dev, ses logs ne transitent pas par Docker) ; à ajouter avec le déploiement staging (S02-OPS-01) où l'API sera conteneurisée.

## Production (gabarits, S10-OPS)

`docker-compose.prod.yml` (API + Traefik, TLS Let's Encrypt automatique), `traefik/` (config
Traefik, en-têtes de sécurité) et `.env.prod.example` (toutes les variables de production,
reprenant les noms de `backend/.env.example`) sont des **gabarits non encore déployés contre un
vrai hébergeur** (aucun domaine ni machine réelle disponible pendant ce sprint) : syntaxiquement
validés (`docker compose -f infra/docker-compose.prod.yml config`) et l'image API testée en
local avec succès, mais jamais testés contre un vrai certificat ni un vrai domaine. Runbook complet
(prérequis, premier déploiement, mise à jour, retour en arrière, origine des secrets) :
`docs/ops/deploiement.md`.

## À venir

- DNS, hébergeur réel, premier déploiement effectif (voir `docs/ops/deploiement.md` §7 pour ce
  qu'il reste à revérifier une fois un hôte choisi), Loki + Promtail.

## Épisodes de test verticaux (`media-samples/`)

Les flux HLS publics (Mux, Apple) sont en 16:9 et ne conviennent pas à un lecteur vertical.
`media-samples/generate.sh` fabrique avec ffmpeg des épisodes de test en 9:16 (1080x1920) conformes
à la section 9 du cahier des charges : HLS multi-débits CMAF (360p, 540p, 720p, 1080p), segments
de 2 s, extrait de 15 s en 540p pour le flux et vignette.

```bash
cd infra/media-samples
./generate.sh 3 30   # 3 épisodes de 30 s dans out/ (ignoré par git)
./upload.sh          # copie dans le bucket MinIO sous hls/samples/
```

Les manifestes sont servis en lecture anonyme :
`http://localhost:9000/drama-media/hls/samples/ep1/master.m3u8` (ep1 à ep3).

Le seed du backend référence ces clés relatives ; l'URL finale est `CDN_BASE_URL` + clé.
Le worker de transcodage du backend (`TRANSCODE_PROVIDER=local`) produit exactement la même échelle de rendus
pour les épisodes déposés depuis le back-office, sous `hls/{episodeId}/`.
Pour tester sur un téléphone du même réseau Wi-Fi, mettre `CDN_BASE_URL=http://<IP-du-PC>:9000/drama-media`
dans `backend/.env` avant `npm run db:seed`, et pointer l'app Android sur la même adresse.
