#!/usr/bin/env bash
# Takes a backup of BeamHaven's database and uploaded files.
# Run on the VM from /opt/beamhaven:   ./scripts/server/backup.sh
#
# Writes two files to ./backups/ (or $BACKUP_DIR), named by date and time:
#   beamhaven-db-<time>.dump        the database (pg_dump custom format)
#   beamhaven-uploads-<time>.tar.gz uploaded files
# Keeps the newest $KEEP_DAYS days (default 14) and deletes older ones.
# The app keeps running: pg_dump takes a consistent snapshot.
#
# These copies live on the VM itself. That protects against mistakes and bad
# updates, but NOT against losing the VM or its disk. Off-site copies come
# in Milestone 10 (BACKUP_AND_RECOVERY.md).
set -euo pipefail

cd "$(dirname "$0")/../.."
BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
stamp="$(date +%Y-%m-%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

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

find "$BACKUP_DIR" -name 'beamhaven-*' -type f -mtime "+$KEEP_DAYS" -delete

echo "Done:"
ls -lh "$db_file" "$uploads_file"
