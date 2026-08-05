#!/usr/bin/env bash
set -euo pipefail

BACKUP_ROOT="${BACKUP_ROOT:-/opt/oracle-messenger-backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_DIR="${BACKUP_ROOT}/${STAMP}"

POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-}"
POSTGRES_DB="${POSTGRES_DB:-oracle_messenger}"
POSTGRES_USER="${POSTGRES_USER:-oracle}"
MEDIA_SOURCE="${MEDIA_SOURCE:-}"
ENV_SOURCE="${ENV_SOURCE:-}"

mkdir -p "$OUT_DIR"
chmod 700 "$BACKUP_ROOT" "$OUT_DIR"

echo "Backup directory: $OUT_DIR"

if [[ -z "$POSTGRES_CONTAINER" ]]; then
  POSTGRES_CONTAINER="$(docker ps --format '{{.Names}}' | grep -Ei 'postgres|db' | head -n 1 || true)"
fi

if [[ -n "$POSTGRES_CONTAINER" ]]; then
  echo "Backing up PostgreSQL from container: $POSTGRES_CONTAINER"
  docker exec "$POSTGRES_CONTAINER" pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip >"${OUT_DIR}/postgres-${POSTGRES_DB}.sql.gz"
else
  echo "WARN: PostgreSQL container not found. Set POSTGRES_CONTAINER to force it."
fi

if [[ -z "$MEDIA_SOURCE" ]]; then
  MEDIA_SOURCE="$(docker volume ls --format '{{.Name}}' | grep -Ei 'media|upload' | head -n 1 || true)"
fi

if [[ -n "$MEDIA_SOURCE" ]]; then
  echo "Backing up media source: $MEDIA_SOURCE"
  if docker volume inspect "$MEDIA_SOURCE" >/dev/null 2>&1; then
    docker run --rm -v "${MEDIA_SOURCE}:/source:ro" -v "${OUT_DIR}:/backup" alpine \
      sh -c 'cd /source && tar -czf /backup/media-uploads.tar.gz .'
  elif [[ -d "$MEDIA_SOURCE" ]]; then
    tar -czf "${OUT_DIR}/media-uploads.tar.gz" -C "$MEDIA_SOURCE" .
  else
    echo "WARN: MEDIA_SOURCE is neither a Docker volume nor a directory: $MEDIA_SOURCE"
  fi
else
  echo "WARN: Media source not found. Set MEDIA_SOURCE to a Docker volume or directory."
fi

if [[ -n "$ENV_SOURCE" && -e "$ENV_SOURCE" ]]; then
  echo "Backing up environment file without printing secrets."
  cp "$ENV_SOURCE" "${OUT_DIR}/env.production"
  chmod 600 "${OUT_DIR}/env.production"
else
  echo "INFO: ENV_SOURCE not set; server secrets were not copied."
fi

sha256sum "${OUT_DIR}"/* 2>/dev/null >"${OUT_DIR}/SHA256SUMS" || true
find "$OUT_DIR" -type f -exec chmod 600 {} \;

echo "Backup complete: $OUT_DIR"

