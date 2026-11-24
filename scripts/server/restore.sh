#!/usr/bin/env bash
# Restores BeamHaven from a backup made by backup.sh. THIS REPLACES the
# current database and uploaded files with the backup's contents.
#
# Run on the VM from /opt/beamhaven:
#   ./scripts/server/restore.sh backups/beamhaven-db-<time>.dump [backups/beamhaven-uploads-<time>.tar.gz]
#
# It asks you to type RESTORE before changing anything. The website and the
# background worker are stopped during the restore and started again at the end.
set -euo pipefail

cd "$(dirname "$0")/../.."
db_file="${1:-}"
uploads_file="${2:-}"
if [[ -z "$db_file" || ! -f "$db_file" ]]; then
  echo "Usage: $0 <database .dump file> [uploads .tar.gz file]" >&2
  exit 1
fi
if [[ -n "$uploads_file" && ! -f "$uploads_file" ]]; then
  echo "Uploads file not found: $uploads_file" >&2
  exit 1
fi

# Refuse a broken file before touching anything.
docker compose exec -T db pg_restore --list < "$db_file" > /dev/null

echo "This replaces ALL current BeamHaven data with:"
echo "  database: $db_file"
[[ -n "$uploads_file" ]] && echo "  uploads:  $uploads_file"
read -r -p "Type RESTORE to continue: " answer
if [[ "$answer" != "RESTORE" ]]; then
  echo "Cancelled. Nothing was changed."
  exit 1
fi

echo "Stopping the website and the worker..."
docker compose stop app worker

echo "Restoring the database..."
docker compose exec -T db sh -c \
  'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --single-transaction' \
  < "$db_file"

if [[ -n "$uploads_file" ]]; then
  echo "Restoring uploaded files..."
  # A short-lived container with the uploads volume mounted (the app is stopped).
  docker compose run --rm --no-deps -T --entrypoint sh app -c \
    'find /data/uploads -mindepth 1 -delete && tar -C /data -xzf -' < "$uploads_file"
fi

echo "Starting the website and the worker..."
docker compose up -d --wait app worker
echo "Restore finished. Check https://<your address>/api/health and sign in."
