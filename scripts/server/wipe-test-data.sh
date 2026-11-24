#!/usr/bin/env bash
# Deletes EVERYTHING in BeamHaven (every login, household, record and uploaded
# file) and starts again with an empty database. This is for clearing the test
# data before real use. It can't be undone, except by restoring the backup it
# takes first.
#
# Run on the VM from /opt/beamhaven:   ./scripts/server/wipe-test-data.sh
#
# 1. Asks you to type WIPE before changing anything.
# 2. Takes a backup (backup.sh) and keeps it in backups/before-wipe/, so you
#    can go back if you change your mind.
# 3. Stops the website and worker, recreates an empty database, empties the
#    uploads, creates the tables again (migrations), and starts everything.
# Afterwards, create your login again:
#   docker compose run --rm ops npm run create-first-account
set -euo pipefail

cd "$(dirname "$0")/../.."

echo "This DELETES ALL BeamHaven data: every login, household, record and uploaded file."
echo "A backup is taken first."
read -r -p "Type WIPE to continue: " answer
if [[ "$answer" != "WIPE" ]]; then
  echo "Cancelled. Nothing was changed."
  exit 1
fi

echo "Taking a backup first..."
./scripts/server/backup.sh
# Moved into before-wipe/, where the nightly clean-up (prune-backups.sh) never deletes it.
backup_dir="${BACKUP_DIR:-./backups}"
keep_dir="$backup_dir/before-wipe"
mkdir -p "$keep_dir"
db_backup="$(ls -t "$backup_dir"/beamhaven-db-*.dump | head -n 1)"
uploads_backup="$(ls -t "$backup_dir"/beamhaven-uploads-*.tar.gz | head -n 1)"
mv "$db_backup" "$uploads_backup" "$keep_dir/"
db_backup="$keep_dir/$(basename "$db_backup")"
uploads_backup="$keep_dir/$(basename "$uploads_backup")"

echo "Stopping the website and the worker..."
docker compose stop app worker

echo "Recreating an empty database..."
# Connects to the "postgres" maintenance database, since you can't drop the one
# you're connected to. --force closes any connection still open.
docker compose exec -T db sh -c \
  'dropdb -U "$POSTGRES_USER" --force "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'

echo "Emptying the uploaded files..."
docker compose run --rm --no-deps -T --entrypoint sh app -c 'find /data/uploads -mindepth 1 -delete'

echo "Creating the tables again..."
docker compose run --rm migrate

echo "Starting the website and the worker..."
docker compose up -d --wait app worker

echo "Wiped. The backup from just before is kept in $keep_dir. To undo:"
echo "  ./scripts/server/restore.sh $db_backup $uploads_backup"
echo "Next, create your login again:"
echo "  docker compose run --rm ops npm run create-first-account"
