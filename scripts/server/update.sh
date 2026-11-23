#!/usr/bin/env bash
# Updates BeamHaven on the VM to the newest version on GitHub.
# Run on the VM from /opt/beamhaven:   ./scripts/server/update.sh
#
# 1. Takes a backup (database and photos), so a bad update can be undone.
# 2. Downloads the newest code (git pull; refuses if files were edited here).
# 3. Rebuilds and restarts. The "migrate" step updates the database tables
#    first; the website only starts once that has worked, and the command
#    waits until it reports healthy.
# 4. Clears out old, unused build images so the disk doesn't fill up.
#
# If anything fails, the script stops and says what to do. Nothing is
# deleted except unused Docker build images.
set -euo pipefail

cd "$(dirname "$0")/../.."

before="$(git rev-parse --short HEAD)"

echo "== 1/4 Taking a backup first"
./scripts/server/backup.sh

echo "== 2/4 Downloading the newest version"
if ! git pull --ff-only; then
  echo
  echo "git pull didn't work, so nothing was changed. Paste the message above to Claude."
  exit 1
fi
after="$(git rev-parse --short HEAD)"
if [ "$before" = "$after" ]; then
  echo "Already up to date ($after). Rebuilding anyway, in case the last update stopped halfway."
else
  echo "Updating from $before to $after:"
  git log --oneline "$before..$after"
fi

echo "== 3/4 Rebuilding and restarting (this takes a few minutes)"
if ! docker compose up -d --build --wait; then
  echo
  echo "The new version didn't start. The previous one was at $before."
  echo "Logs:   docker compose logs --tail 100 migrate app"
  echo "To go back to it, see 'If an update goes wrong' in DEPLOYMENT.md."
  exit 1
fi

echo "== 4/4 Tidying up old build images"
docker image prune -f > /dev/null

docker compose ps
echo
echo "Done. BeamHaven is running version $after."
