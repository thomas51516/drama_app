#!/usr/bin/env sh
# Restauration d'une sauvegarde pg_dump -Fc dans une base (S05-OPS-01).
#
# Usage : infra/scripts/restore.sh <fichier.dump> [base-cible]
#   * la base cible est créée si elle n'existe pas ; par défaut `drama_restore` (jamais la base de dev
#     par défaut : restaurer dans `drama` écrase les données courantes, il faut le demander explicitement) ;
#   * --clean --if-exists : les objets existants de la cible sont remplacés.
#
# Variables : PGHOST, PGPORT, PGUSER, PGPASSWORD (défauts : localhost / 5432 / drama / drama),
#             POSTGRES_CONTAINER (défaut : drama-postgres, utilisé si pg_restore n'est pas installé).
set -eu

dump="${1:?usage: restore.sh <fichier.dump> [base-cible]}"
target="${2:-drama_restore}"
PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-drama}"
export PGPASSWORD="${PGPASSWORD:-drama}"
container="${POSTGRES_CONTAINER:-drama-postgres}"

[ -f "$dump" ] || { echo "Fichier introuvable : $dump" >&2; exit 1; }

if command -v pg_restore >/dev/null 2>&1 && command -v psql >/dev/null 2>&1; then
  psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d postgres -v ON_ERROR_STOP=1 -tc \
    "SELECT 1 FROM pg_database WHERE datname = '$target'" | grep -q 1 \
    || psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$target\""
  pg_restore -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$target" --clean --if-exists --no-owner --no-acl "$dump"
else
  docker exec -e PGPASSWORD="$PGPASSWORD" "$container" psql -U "$PGUSER" -d postgres -tc \
    "SELECT 1 FROM pg_database WHERE datname = '$target'" | grep -q 1 \
    || docker exec -e PGPASSWORD="$PGPASSWORD" "$container" psql -U "$PGUSER" -d postgres -c "CREATE DATABASE \"$target\""
  docker exec -i -e PGPASSWORD="$PGPASSWORD" "$container" \
    pg_restore -U "$PGUSER" -d "$target" --clean --if-exists --no-owner --no-acl < "$dump"
fi
echo "[restore] $dump → base $target"
echo "[restore] vérification : psql -d $target -c 'SELECT COUNT(*) FROM users'"
