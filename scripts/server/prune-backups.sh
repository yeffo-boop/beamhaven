#!/usr/bin/env bash
# Deletes old local backups, keeping (ADR-041):
#   the newest backup of each of the last 7 days that have one,
#   the newest of each of the last 4 weeks, and
#   the newest of each of the last 12 months.
# backup.sh runs this after every backup. To see what it would delete
# without deleting anything:
#   ./scripts/server/prune-backups.sh --dry-run
#
# A backup is the pair beamhaven-db-<time>.dump and
# beamhaven-uploads-<time>.tar.gz, where <time> is YYYY-MM-DD_HHMMSS.
set -euo pipefail

cd "$(dirname "$0")/../.."
BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_DAILY="${KEEP_DAILY:-7}"
KEEP_WEEKLY="${KEEP_WEEKLY:-4}"
KEEP_MONTHLY="${KEEP_MONTHLY:-12}"
dry_run=false
[[ "${1:-}" == "--dry-run" ]] && dry_run=true

[[ -d "$BACKUP_DIR" ]] || exit 0

# Every backup time, newest first.
mapfile -t stamps < <(
  find "$BACKUP_DIR" -maxdepth 1 -type f -name 'beamhaven-*' \
    | sed -nE 's/.*beamhaven-(db|uploads)-([0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{6})\.(dump|tar\.gz)$/\2/p' \
    | sort -ru
)

declare -A keep=() days=() weeks=() months=()
for stamp in "${stamps[@]}"; do
  day="${stamp%%_*}"
  week="$(date -u -d "$day" +%G-W%V)"
  month="${day:0:7}"
  if [[ -z "${days[$day]:-}" && ${#days[@]} -lt $KEEP_DAILY ]]; then
    days[$day]=1
    keep[$stamp]=1
  fi
  if [[ -z "${weeks[$week]:-}" && ${#weeks[@]} -lt $KEEP_WEEKLY ]]; then
    weeks[$week]=1
    keep[$stamp]=1
  fi
  if [[ -z "${months[$month]:-}" && ${#months[@]} -lt $KEEP_MONTHLY ]]; then
    months[$month]=1
    keep[$stamp]=1
  fi
done

for stamp in "${stamps[@]}"; do
  [[ -n "${keep[$stamp]:-}" ]] && continue
  for file in "$BACKUP_DIR/beamhaven-db-$stamp.dump" "$BACKUP_DIR/beamhaven-uploads-$stamp.tar.gz"; do
    [[ -f "$file" ]] || continue
    if $dry_run; then echo "would delete $file"; else rm -f -- "$file"; echo "deleted $file"; fi
  done
done

# Leftovers from a backup that was interrupted halfway, once they're a day old.
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'beamhaven-*.partial' -mtime +0 \
  $($dry_run && echo -print || echo -print -delete)
