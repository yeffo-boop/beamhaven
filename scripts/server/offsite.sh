#!/usr/bin/env bash
# Runs restic against the off-site backup repository set in .env (ADR-041).
# backup.sh uses it after every backup. You can use it to look and restore:
#
#   ./scripts/server/offsite.sh snapshots          list the off-site backups
#   ./scripts/server/offsite.sh restore latest --target /backups/from-offsite
#                                                  bring the newest back into
#                                                  ./backups/from-offsite
#   ./scripts/server/offsite.sh check              check the repository
#
# restic runs in a short-lived container (nothing is installed on the VM).
# It only gets restic's own settings from .env (RESTIC_*, B2_*, AWS_*), never
# the database password. ./backups is mounted at /backups, and .env at
# /config/.env (read-only). Everything is encrypted with RESTIC_PASSWORD
# before it leaves the VM: keep that password in your password manager,
# because without it the off-site copies can't be opened.
set -euo pipefail

cd "$(dirname "$0")/../.."
RESTIC_IMAGE="${RESTIC_IMAGE:-restic/restic:0.18.0}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"

setting() { sed -nE "s/^$1=(.*)$/\1/p" .env 2>/dev/null | tail -n 1; }
repository="$(setting RESTIC_REPOSITORY)"
if [[ -z "$repository" ]]; then
  echo "RESTIC_REPOSITORY isn't set in .env, so there's no off-site repository." >&2
  exit 2
fi
if [[ -z "$(setting RESTIC_PASSWORD)" ]]; then
  echo "RESTIC_PASSWORD isn't set in .env." >&2
  exit 2
fi

mkdir -p "$BACKUP_DIR"
backup_abs="$(cd "$BACKUP_DIR" && pwd)"
restic_env="$(mktemp)"
chmod 600 "$restic_env"
trap 'rm -f "$restic_env"' EXIT
grep -E '^(RESTIC_|B2_|AWS_)[A-Z_]*=' .env > "$restic_env"

# Restores are written into ./backups, so it's writable; .env is read-only.
mounts=(-v "$backup_abs:/backups" -v "$(pwd)/.env:/config/.env:ro")
# A folder repository (a NAS share or USB drive mounted on the VM) is mounted too.
if [[ "$repository" == /* ]]; then
  mkdir -p "$repository"
  mounts+=(-v "$repository:$repository")
fi

exec docker run --rm --env-file "$restic_env" --hostname beamhaven "${mounts[@]}" \
  "$RESTIC_IMAGE" "$@"
