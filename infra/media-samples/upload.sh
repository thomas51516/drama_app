#!/usr/bin/env bash
# Copie les épisodes de test générés par generate.sh dans le bucket MinIO de dev,
# sous le préfixe hls/samples/. Le bucket est en lecture anonyme (voir docker-compose.dev.yml).
#
# Usage : ./upload.sh
set -euo pipefail
OUT="$(cd "$(dirname "$0")" && pwd)/out"
CONTAINER="${MINIO_CONTAINER:-drama-minio}"
BUCKET="${S3_BUCKET:-drama-media}"
USER="${MINIO_ROOT_USER:-minioadmin}"
PASS="${MINIO_ROOT_PASSWORD:-minioadmin}"

[ -d "$OUT" ] || { echo "Lancez d'abord generate.sh" >&2; exit 1; }
docker exec "$CONTAINER" rm -rf /tmp/samples
docker cp "$OUT/." "$CONTAINER:/tmp/samples"
docker exec "$CONTAINER" sh -c "
  mc alias set local http://localhost:9000 '$USER' '$PASS' >/dev/null &&
  mc cp --quiet --recursive /tmp/samples/ local/$BUCKET/hls/samples/ &&
  mc ls --recursive local/$BUCKET/hls/samples/ | wc -l"
echo "Manifestes : http://localhost:9000/$BUCKET/hls/samples/ep1/master.m3u8 (ep1..epN)"
