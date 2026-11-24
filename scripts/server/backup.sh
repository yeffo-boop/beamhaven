#!/usr/bin/env bash
# Takes a backup of BeamHaven's database and uploaded files.
# Run on the VM from /opt/beamhaven:   ./scripts/server/backup.sh
# (cron runs it every night; update.sh runs it before each update.)
#
# 1. Writes two files to ./backups/ (or $BACKUP_DIR), named by date and time:
#      beamhaven-db-<time>.dump        the database (pg_dump custom format)
#      beamhaven-uploads-<time>.tar.gz uploaded files
#    The app keeps running: pg_dump takes a consistent snapshot.
# 2. Checks the database file is a readable dump.
# 3. Keeps 7 daily, 4 weekly and 12 monthly backups (prune-backups.sh).
# 4. If RESTIC_REPOSITORY is set in .env, copies the new backup and .env,
#    encrypted, to the off-site place it names (offsite.sh), and keeps the
#    same 7/4/12 there (ADR-041). If it isn't set, this step is skipped.
# 5. Writes backups/status/last-backup.json, which BeamHaven reads to warn
#    owners when backups stop working.
# -E passes the error trap into functions too (run_offsite), so their failures are recorded.
set -Eeuo pipefail

cd "$(dirname "$0")/../.."
BACKUP_DIR="${BACKUP_DIR:-./backups}"
STATUS_DIR="$BACKUP_DIR/status"
stamp="$(date +%Y-%m-%d_%H%M%S)"
mkdir -p "$BACKUP_DIR" "$STATUS_DIR"
chmod 700 "$BACKUP_DIR"
if [[ ! -w "$STATUS_DIR" ]]; then
  echo "Can't write to $STATUS_DIR (Docker may have created it as root). Fix it with:" >&2
  echo "  sudo chown $(id -un): $STATUS_DIR" >&2
  exit 1
fi
# The app container reads the status as an unprivileged user.
chmod 755 "$STATUS_DIR"

offsite="skipped"
write_status() {
  local ok="$1" message="$2"
  local file="$STATUS_DIR/last-backup.json"
  # The last successful time is kept when a run fails, so the warning knows how old it is.
  local last_ok=""
  if [[ "$ok" == "true" ]]; then
    last_ok="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  elif [[ -f "$file" ]]; then
    last_ok="$(sed -nE 's/.*"lastSuccessAt": *"([^"]*)".*/\1/p' "$file")"
  fi
  printf '{"finishedAt":"%s","ok":%s,"lastSuccessAt":"%s","offsite":"%s","message":"%s"}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$ok" "$last_ok" "$offsite" "$message" > "$file.partial"
  mv "$file.partial" "$file"
  chmod 644 "$file"
}
# Any failure below is recorded, then the script stops with an error.
trap 'write_status false "The backup stopped at line $LINENO. Run ./scripts/server/backup.sh to see why."' ERR

db_file="$BACKUP_DIR/beamhaven-db-$stamp.dump"
uploads_file="$BACKUP_DIR/beamhaven-uploads-$stamp.tar.gz"

echo "Backing up the database..."
# The variables are expanded inside the db container, which already has them.
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$db_file.partial"
mv "$db_file.partial" "$db_file"

echo "Backing up uploaded files..."
docker compose exec -T app tar -C /data -czf - uploads > "$uploads_file.partial"
mv "$uploads_file.partial" "$uploads_file"

chmod 600 "$db_file" "$uploads_file"

# Check the database file is a readable dump, not an empty or broken one.
docker compose exec -T db pg_restore --list < "$db_file" > /dev/null

echo "Removing old local backups (keeping 7 daily, 4 weekly, 12 monthly)..."
BACKUP_DIR="$BACKUP_DIR" ./scripts/server/prune-backups.sh

# Reads one setting from .env without running the file as a script.
setting() { sed -nE "s/^$1=(.*)$/\1/p" .env 2>/dev/null | tail -n 1; }

if [[ -n "$(setting RESTIC_REPOSITORY)" ]]; then
  echo "Copying off-site (encrypted)..."
  offsite="failed"
  run_offsite() { BACKUP_DIR="$BACKUP_DIR" ./scripts/server/offsite.sh "$@"; }
  # The first time, the repository has to be created.
  if ! run_offsite cat config > /dev/null 2>&1; then
    echo "Setting up the off-site repository (first time only)..."
    run_offsite init
  fi
  run_offsite backup --tag beamhaven \
    "/backups/$(basename "$db_file")" "/backups/$(basename "$uploads_file")" /config/.env
  # Grouped by host and tag, not by path: the file names change every night, and
  # restic's default (by path) would keep every snapshot forever.
  run_offsite forget --tag beamhaven --group-by host,tags \
    --keep-daily 7 --keep-weekly 4 --keep-monthly 12 --prune
  # Once a week (Sundays), check part of the off-site data can really be read back.
  if [[ "$(date +%u)" == "7" ]]; then
    run_offsite check --read-data-subset 5%
  fi
  offsite="ok"
fi

write_status true ""
echo "Done:"
ls -lh "$db_file" "$uploads_file"
