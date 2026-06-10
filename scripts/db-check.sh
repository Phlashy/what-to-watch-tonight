#!/bin/bash
#
# db-check.sh — Is the local (Mac) dev DB current with PRODUCTION (Pi)?
#
# Compares viewing count + latest viewing timestamp between the local copy and
# the live Pi. Designed to run before development (wired into `npm run dev`) so
# you never unknowingly work against a stale database again.
#
# Exit codes:
#   0  fresh, OR can't reach the Pi (we don't block work when the Pi is offline)
#   1  STALE — local is behind production (caller decides whether to warn/block)
#
set -uo pipefail

PI_HOST="${PI_HOST:-gordon@anguspi.local}"
PI_SERVER_DIR="${PI_SERVER_DIR:-~/what-to-watch-tonight/server}"
LOCAL_DB="${LOCAL_DB:-$HOME/movie-night-data/movies.db}"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Local stats (count|latest). Empty if no local DB.
LOCAL_STATS=""
if [ -f "$LOCAL_DB" ]; then
  LOCAL_STATS="$(cd "$PROJECT_DIR" && LOCAL_DB="$LOCAL_DB" node -e '
    const Database = require("better-sqlite3");
    try {
      const db = new Database(process.env.LOCAL_DB, { readonly: true });
      const n = db.prepare("SELECT COUNT(*) n FROM viewings").get().n;
      const m = db.prepare("SELECT MAX(created_at) m FROM viewings").get().m || "";
      process.stdout.write(n + "|" + m);
      db.close();
    } catch (e) { process.stdout.write(""); }
  ' 2>/dev/null)"
fi

# Pi stats — skip quickly if unreachable.
if ! ssh -o ConnectTimeout=6 -o BatchMode=yes "$PI_HOST" 'true' 2>/dev/null; then
  echo "ℹ️  DB freshness: couldn't reach the Pi — can't verify. Proceeding (local DB unchanged)."
  exit 0
fi

PI_STATS="$(ssh "$PI_HOST" "cat > $PI_SERVER_DIR/_stat.cjs && cd $PI_SERVER_DIR && node _stat.cjs; rm -f $PI_SERVER_DIR/_stat.cjs" <<'PISCRIPT' 2>/dev/null
const Database = require('better-sqlite3');
const os = require('os'), path = require('path');
const db = new Database(path.join(os.homedir(), 'movie-night-data', 'movies.db'), { readonly: true });
const n = db.prepare('SELECT COUNT(*) n FROM viewings').get().n;
const m = db.prepare('SELECT MAX(created_at) m FROM viewings').get().m || '';
process.stdout.write(n + '|' + m);
db.close();
PISCRIPT
)"

PI_COUNT="${PI_STATS%%|*}"; PI_LATEST="${PI_STATS#*|}"
LOCAL_COUNT="${LOCAL_STATS%%|*}"; LOCAL_LATEST="${LOCAL_STATS#*|}"

if [ -z "$LOCAL_STATS" ]; then
  echo "⚠️  DB freshness: no local DB found. Run: npm run db:pull"
  exit 1
fi

if [ "$LOCAL_COUNT" = "$PI_COUNT" ] && [ "$LOCAL_LATEST" = "$PI_LATEST" ]; then
  echo "✅ DB freshness: local matches production ($LOCAL_COUNT viewings, latest $LOCAL_LATEST)."
  exit 0
fi

echo ""
echo "⚠️  DB IS STALE — local dev DB is behind production:"
echo "      local:      $LOCAL_COUNT viewings, latest ${LOCAL_LATEST:-none}"
echo "      production: $PI_COUNT viewings, latest ${PI_LATEST:-none}"
echo "    Refresh with:  npm run db:pull"
echo ""
exit 1
