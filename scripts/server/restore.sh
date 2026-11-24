#!/usr/bin/env bash
# Restores BeamHaven from a backup made by backup.sh. THIS REPLACES the
# current database and uploaded files with the backup's contents.
#
# Run on the VM from /opt/beamhaven:
#   ./scripts/server/restore.sh backups/beamhaven-db-<time>.dump [backups/beamhaven-uploads-<time>.tar.gz]
#
# It asks you to type RESTORE before changing anything, and saves a copy of the
# current database to backups/before-restore/ first. The website and the
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

# A copy of the database as it is now, in case the backup turns out to be the wrong one.
# It goes in before-restore/, where the nightly clean-up never deletes it.
safety_dir="${BACKUP_DIR:-./backups}/before-restore"
mkdir -p "$safety_dir"
safety_file="$safety_dir/beamhaven-db-$(date +%Y-%m-%d_%H%M%S).dump"
echo "Saving a copy of the current database to $safety_file..."
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$safety_file"
chmod 600 "$safety_file"

echo "Restoring the database..."
# The database is recreated empty rather than cleaned table by table: the job
# queue (pg-boss) uses partitioned tables, which pg_restore --clean can't drop.
docker compose exec -T db sh -c \
  'dropdb -U "$POSTGRES_USER" --force "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
docker compose exec -T db sh -c \
  'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --single-transaction --exit-on-error' \
  < "$db_file"

if [[ -n "$uploads_file" ]]; then
  echo "Restoring uploaded files..."
  # A short-lived container with the uploads volume mounted (the app is stopped).
  docker compose run --rm --no-deps -T --entrypoint sh app -c \
    'find /data/uploads -mindepth 1 -delete && tar -C /data -xzf -' < "$uploads_file"
fi

echo "Starting the website and the worker..."
docker compose up -d --wait app worker
echo "Restore finished. Now run ./scripts/server/restore-check.sh, then sign in."
