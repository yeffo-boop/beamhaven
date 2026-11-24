#!/usr/bin/env bash
# Checks that BeamHaven came back properly after a restore (or any time).
# Run on the VM from /opt/beamhaven:   ./scripts/server/restore-check.sh
# It only reads; it changes nothing.
#
# It checks:
#   1. the website answers /api/health with "ok";
#   2. how many logins, households, projects, expenses and files there are,
#      and the newest expense, so you can compare with what you remember;
#   3. that every uploaded file the database knows about is really on disk.
# It ends with "RESTORE CHECK PASSED", or says what's wrong and exits with an error.
set -euo pipefail

cd "$(dirname "$0")/../.."
problems=0

echo "1. Website health:"
if health="$(docker compose exec -T app node -e \
  "fetch('http://127.0.0.1:3000/api/health').then(r=>r.text()).then(t=>{console.log(t);process.exit(t.includes('\"status\":\"ok\"')?0:1)}).catch(e=>{console.log(e.message);process.exit(1)})")"; then
  echo "   ok: $health"
else
  echo "   PROBLEM: $health"
  problems=$((problems + 1))
fi

# Runs a query inside the db container (the variables are expanded there).
sql() {
  docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -v ON_ERROR_STOP=1' <<<"$1"
}

echo "2. What's in the database:"
sql "SELECT '   logins:     ' || count(*) FROM users;
     SELECT '   households: ' || count(*) FROM workspaces;
     SELECT '   projects:   ' || count(*) FROM projects;
     SELECT '   expenses:   ' || count(*) FROM expenses;
     SELECT '   files:      ' || count(*) FROM files;
     SELECT '   newest expense: ' || coalesce((SELECT expense_date::date || ' ' || description
       FROM expenses ORDER BY expense_date DESC, created_at DESC LIMIT 1), '(none)');"

echo "3. Uploaded files on disk:"
# Storage keys are random letters, digits, dashes and slashes (never a file name).
missing="$(sql "SELECT storage_key FROM files ORDER BY storage_key;" |
  docker compose exec -T app sh -c \
    'n=0; while IFS= read -r k; do [ -f "/data/uploads/$k" ] || { n=$((n+1)); [ $n -le 5 ] && echo "   missing: $k"; }; done; echo "$n"')"
missing_count="$(tail -n 1 <<<"$missing")"
if [[ "$missing_count" == "0" ]]; then
  echo "   ok: every file is there"
else
  head -n -1 <<<"$missing"
  echo "   PROBLEM: $missing_count file(s) missing. Did you restore the uploads .tar.gz too?"
  problems=$((problems + 1))
fi

if [[ "$problems" -gt 0 ]]; then
  echo "RESTORE CHECK FAILED ($problems problem(s) above)."
  exit 1
fi
echo "RESTORE CHECK PASSED. Now sign in, and open a recent receipt or photo."
