#!/usr/bin/env bash
# Nightly backup: Postgres (logical dump) + MinIO data + secrets, encrypted,
# uploaded to Google Drive via rclone. Run on the VM via
# deploy/systemd/autograder-backup.timer (see docs/RESTORE.md for restore).
set -euo pipefail

AUTOGRADER_ROOT="${AUTOGRADER_ROOT:-/opt/autograder}"
BACKUP_STAGING_ROOT="${BACKUP_STAGING_ROOT:-$AUTOGRADER_ROOT/backups}"
GPG_PASSPHRASE_FILE="${GPG_PASSPHRASE_FILE:-/etc/autograder/backup-gpg-passphrase}"
TLS_DIR="${TLS_DIR:-/etc/autograder/tls}"
GDRIVE_REMOTE="${GDRIVE_REMOTE:-gdrive}"
MINIO_RCLONE_REMOTE="${MINIO_RCLONE_REMOTE:-minio_local}"
MINIO_BUCKET="${MINIO_BUCKET:-autograder-bucket}"

COMPOSE="docker compose -f $AUTOGRADER_ROOT/docker-compose.prod.yml --env-file $AUTOGRADER_ROOT/backend/.env"

# shellcheck disable=SC1090
source "$AUTOGRADER_ROOT/backend/.env"

TS=$(date +%Y%m%d-%H%M%S)
STAGE="$BACKUP_STAGING_ROOT/$TS"
mkdir -p "$STAGE"
trap 'rm -rf "$STAGE"' EXIT

echo "[backup] $TS: dumping Postgres..."
$COMPOSE exec -T db pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB" > "$STAGE/postgres.dump"

echo "[backup] $TS: syncing MinIO data..."
rclone sync "$MINIO_RCLONE_REMOTE:$MINIO_BUCKET" "$STAGE/minio_data" --fast-list

echo "[backup] $TS: capturing secrets (.env, TLS cert/key)..."
cp "$AUTOGRADER_ROOT/backend/.env" "$STAGE/backend.env"
cp "$TLS_DIR"/*.crt "$TLS_DIR"/*.key "$STAGE/" 2>/dev/null || true

echo "[backup] $TS: encrypting..."
ARCHIVE="$BACKUP_STAGING_ROOT/$TS.tar.gz"
tar -czf "$ARCHIVE" -C "$BACKUP_STAGING_ROOT" "$TS"
gpg --batch --yes --cipher-algo AES256 --symmetric \
    --passphrase-file "$GPG_PASSPHRASE_FILE" \
    -o "$ARCHIVE.gpg" "$ARCHIVE"
rm -f "$ARCHIVE"

echo "[backup] $TS: uploading to Google Drive..."
rclone copy "$ARCHIVE.gpg" "$GDRIVE_REMOTE:autograder-backups/daily/"

echo "[backup] $TS: local cleanup (keep last 2 local copies)..."
find "$BACKUP_STAGING_ROOT" -maxdepth 1 -name '*.tar.gz.gpg' -mtime +2 -delete

echo "[backup] $TS: enforcing retention on Drive..."
"$(dirname "$0")/retention.sh"

echo "[backup] $TS: done."
