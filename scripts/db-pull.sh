#!/bin/bash
#
# db-pull.sh — Refresh the local (Mac) development database from PRODUCTION (Pi).
#
# Production lives on the Pi. The local copy at ~/movie-night-data/movies.db is a
# DEV copy that drifts stale as the family keeps using the live app. Run this
# before doing any local development so you're working against current data.
#
# Safety:
#   • Takes a CONSISTENT snapshot on the Pi (SQLite online-backup API), so it's
#     correct even while the app is being used (WAL-safe — a raw scp is not).
#   • Backs up your current local DB first (timestamped) before overwriting.
#   • Verifies the snapshot opens and passes an integrity check before installing.
#   • Removes stale -wal/-shm sidecars so SQLite can't replay an old WAL onto the
#     fresh file (which would corrupt it).
#
# This script only ever pulls Pi -> Mac. To go the other way (rare, dangerous)
# use db-push.sh, which guards production.
#
set -euo pipefail

PI_HOST="${PI_HOST:-gordon@anguspi.local}"
PI_SERVER_DIR="${PI_SERVER_DIR:-~/what-to-watch-tonight/server}"   # has better-sqlite3
PI_DB="${PI_DB:-~/movie-night-data/movies.db}"
LOCAL_DB="${LOCAL_DB:-$HOME/movie-night-data/movies.db}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/movie-night-data/backups}"
KEEP_BACKUPS="${KEEP_BACKUPS:-10}"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"   # for local node + better-sqlite3
TS="$(date +%Y%m%d-%H%M%S)"

echo ""
echo "🎬 Movie Night — pull production DB (Pi → Mac)"
echo ""

# 1) Pi reachable?
if ! ssh -o ConnectTimeout=8 -o BatchMode=yes "$PI_HOST" 'true' 2>/dev/null; then
  echo "✗ Can't reach the Pi ($PI_HOST). Is it on and on the network?"
  echo "  (Nothing changed locally.)"
  exit 1
fi

# 2) Make a consistent snapshot on the Pi via the SQLite online-backup API.
echo "[1/5] Snapshotting production on the Pi (WAL-safe)…"
ssh "$PI_HOST" "cat > $PI_SERVER_DIR/_snapshot.cjs && cd $PI_SERVER_DIR && node _snapshot.cjs; rm -f $PI_SERVER_DIR/_snapshot.cjs" <<'PISCRIPT'
const Database = require('better-sqlite3');
const os = require('os'), path = require('path');
const src = path.join(os.homedir(), 'movie-night-data', 'movies.db');
const dest = '/tmp/wtwt-snapshot.db';
const db = new Database(src);
db.backup(dest)
  .then(() => {
    const c = new Database(dest, { readonly: true });
    const n = c.prepare('SELECT COUNT(*) n FROM viewings').get().n;
    const latest = c.prepare('SELECT MAX(created_at) m FROM viewings').get().m;
    c.close(); db.close();
    console.log('SNAPSHOT_OK viewings=' + n + ' latest=' + latest);
  })
  .catch(e => { console.error('SNAPSHOT_FAIL ' + e.message); process.exit(1); });
PISCRIPT

# 3) Copy the snapshot down to a local temp file.
echo "[2/5] Downloading snapshot…"
TMP_LOCAL="$(mktemp -t wtwt-snapshot).db"
scp -q "$PI_HOST:/tmp/wtwt-snapshot.db" "$TMP_LOCAL"
ssh "$PI_HOST" 'rm -f /tmp/wtwt-snapshot.db' 2>/dev/null || true

# 4) Verify the downloaded snapshot before trusting it.
echo "[3/5] Verifying snapshot integrity…"
cd "$PROJECT_DIR"
SNAP_DB="$TMP_LOCAL" node -e '
const Database = require("better-sqlite3");
const db = new Database(process.env.SNAP_DB, { readonly: true });
const ok = db.pragma("integrity_check", { simple: true });
if (ok !== "ok") { console.error("✗ integrity_check failed:", ok); process.exit(1); }
const n = db.prepare("SELECT COUNT(*) n FROM viewings").get().n;
if (n < 1) { console.error("✗ snapshot has no viewings — refusing to install"); process.exit(1); }
console.log("   ✓ integrity ok · " + n + " viewings");
db.close();
'

# 5) Back up the current local DB, then install the fresh snapshot.
mkdir -p "$BACKUP_DIR"
if [ -f "$LOCAL_DB" ]; then
  echo "[4/5] Backing up current local DB → $BACKUP_DIR/movies-mac-$TS.db"
  cp "$LOCAL_DB" "$BACKUP_DIR/movies-mac-$TS.db"
else
  echo "[4/5] No existing local DB to back up (first pull)."
  mkdir -p "$(dirname "$LOCAL_DB")"
fi

echo "[5/5] Installing fresh snapshot…"
mv "$TMP_LOCAL" "$LOCAL_DB"
# Critical: drop stale WAL/SHM so SQLite doesn't replay an old WAL onto the new file.
rm -f "$LOCAL_DB-wal" "$LOCAL_DB-shm"

# Prune old Mac backups (keep the most recent $KEEP_BACKUPS).
ls -1t "$BACKUP_DIR"/movies-mac-*.db 2>/dev/null | tail -n +$((KEEP_BACKUPS + 1)) | xargs -r rm -f

echo ""
echo "✓ Local DB is now a fresh copy of production."
echo "  Local:   $LOCAL_DB"
echo "  Backups: $BACKUP_DIR (keeping last $KEEP_BACKUPS)"
echo ""
