#!/bin/bash
#
# db-push.sh — Push the LOCAL (Mac) database UP to PRODUCTION (Pi). DANGEROUS.
#
# This OVERWRITES the live family database with your local copy. You almost never
# want this — the normal direction is db-pull (Pi → Mac). Legitimate uses:
#   • Restoring production from a known-good local backup.
#   • Seeding a fresh Pi for the first time.
#
# Guards:
#   • Backs up the CURRENT production DB on the Pi first (timestamped).
#   • Shows you both DBs' viewing counts and makes you type the production count
#     to confirm you understand what you're about to replace.
#   • Installs atomically and clears stale WAL/SHM on the Pi.
#
set -euo pipefail

PI_HOST="${PI_HOST:-gordon@anguspi.local}"
PI_SERVER_DIR="${PI_SERVER_DIR:-~/what-to-watch-tonight/server}"
PI_DB="${PI_DB:-\$HOME/movie-night-data/movies.db}"
PI_BACKUP_DIR="${PI_BACKUP_DIR:-\$HOME/movie-night-data/backups}"
LOCAL_DB="${LOCAL_DB:-$HOME/movie-night-data/movies.db}"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TS="$(date +%Y%m%d-%H%M%S)"

echo ""
echo "⚠️  Movie Night — PUSH local DB UP to PRODUCTION (Mac → Pi)"
echo "    This will OVERWRITE the live family database."
echo ""

[ -f "$LOCAL_DB" ] || { echo "✗ No local DB at $LOCAL_DB"; exit 1; }
ssh -o ConnectTimeout=8 -o BatchMode=yes "$PI_HOST" 'true' 2>/dev/null || { echo "✗ Can't reach the Pi."; exit 1; }

# Local count
LOCAL_COUNT="$(cd "$PROJECT_DIR" && LOCAL_DB="$LOCAL_DB" node -e 'const D=require("better-sqlite3");const db=new D(process.env.LOCAL_DB,{readonly:true});process.stdout.write(""+db.prepare("SELECT COUNT(*) n FROM viewings").get().n);db.close();')"

# Production count
PI_COUNT="$(ssh "$PI_HOST" "cat > $PI_SERVER_DIR/_stat.cjs && cd $PI_SERVER_DIR && node _stat.cjs; rm -f $PI_SERVER_DIR/_stat.cjs" <<'PISCRIPT' 2>/dev/null
const D=require('better-sqlite3');const os=require('os'),p=require('path');
const db=new D(p.join(os.homedir(),'movie-night-data','movies.db'),{readonly:true});
process.stdout.write(''+db.prepare('SELECT COUNT(*) n FROM viewings').get().n);db.close();
PISCRIPT
)"

echo "    Local (will become production): $LOCAL_COUNT viewings"
echo "    Production (will be replaced):  $PI_COUNT viewings"
echo ""
printf "To confirm, type the PRODUCTION viewing count (%s): " "$PI_COUNT"
read -r CONFIRM
[ "$CONFIRM" = "$PI_COUNT" ] || { echo "✗ Did not match. Aborted. Nothing changed."; exit 1; }

echo "[1/3] Backing up current production on the Pi…"
ssh "$PI_HOST" "mkdir -p $PI_BACKUP_DIR && cp $PI_DB $PI_BACKUP_DIR/movies-prod-$TS.db && echo '   ✓ '$PI_BACKUP_DIR/movies-prod-$TS.db"

echo "[2/3] Uploading local DB…"
scp -q "$LOCAL_DB" "$PI_HOST:/tmp/wtwt-upload.db"

echo "[3/3] Installing on the Pi (atomic + clear WAL)…"
ssh "$PI_HOST" "mv /tmp/wtwt-upload.db $PI_DB && rm -f $PI_DB-wal $PI_DB-shm && echo '   ✓ installed'"

echo ""
echo "✓ Production replaced. Restart the app:  ssh $PI_HOST 'pm2 restart movie-night'"
echo ""
