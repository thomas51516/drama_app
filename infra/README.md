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

Le service one-shot `minio-init` s'exécute automatiquement après que MinIO est sain : il crée le bucket `drama-media` (idempotent) et lui donne une politique de lecture anonyme (`download`), pratique pour tester des manifestes HLS en local. Pour le relancer à la main :

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

## À venir

- `S01-OPS-03` : VPS staging, DNS, Traefik + TLS.
- Supervision (Prometheus, Grafana, Loki) et Sentry : cahier des charges §12.

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
Pour tester sur un téléphone du même réseau Wi-Fi, mettre `CDN_BASE_URL=http://<IP-du-PC>:9000/drama-media`
dans `backend/.env` avant `npm run db:seed`, et pointer l'app Android sur la même adresse.
