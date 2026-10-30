#!/usr/bin/env sh
# Sauvegarde PostgreSQL compressée (pg_dump -Fc) avec rétention (S05-OPS-01).
#
# Deux usages :
#   * dans le conteneur `postgres-backup` (boucle quotidienne, voir docker-compose.dev.yml) ;
#   * à la main depuis l'hôte : infra/scripts/backup.sh [dossier-de-sortie]
#     (utilise pg_dump local s'il existe, sinon `docker exec drama-postgres`).
#
# Variables : PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE (défauts : drama / drama / drama),
#             BACKUP_DIR (défaut : /backups dans le conteneur, ./backups sur l'hôte),
#             BACKUP_RETENTION_DAYS (défaut : 14).
set -eu

PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-drama}"
PGDATABASE="${PGDATABASE:-drama}"
export PGPASSWORD="${PGPASSWORD:-drama}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
BACKUP_DIR="${1:-${BACKUP_DIR:-./backups}}"

mkdir -p "$BACKUP_DIR"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="$BACKUP_DIR/${PGDATABASE}-${stamp}.dump"
tmp="$target.part"

if command -v pg_dump >/dev/null 2>&1; then
  pg_dump -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -Fc --no-owner --no-acl -f "$tmp"
else
  # Hôte sans client PostgreSQL : on passe par le conteneur de dev.
  docker exec -e PGPASSWORD="$PGPASSWORD" "${POSTGRES_CONTAINER:-drama-postgres}" \
    pg_dump -U "$PGUSER" -d "$PGDATABASE" -Fc --no-owner --no-acl > "$tmp"
fi
mv "$tmp" "$target"
size="$(du -h "$target" | cut -f1)"
echo "[backup] $(date -u +%FT%TZ) $target ($size)"

# Rétention : suppression des sauvegardes plus anciennes que N jours.
find "$BACKUP_DIR" -name "${PGDATABASE}-*.dump" -type f -mtime "+$BACKUP_RETENTION_DAYS" -print -delete \
  | sed 's/^/[backup] purge /' || true
