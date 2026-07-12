#!/usr/bin/env node
/**
 * pi-db-backup.cjs — Consistent timestamped backup of the PRODUCTION database.
 *
 * Runs ON THE PI (via cron, nightly). Uses SQLite's online-backup API so the
 * snapshot is transactionally complete even while the family is using the app
 * (a raw file copy in WAL mode is not safe). Keeps the most recent KEEP backups.
 *
 * Install (on the Pi):
 *   crontab -e  →  0 3 * * * cd ~/what-to-watch-tonight && /path/to/node scripts/pi-db-backup.cjs >> ~/movie-night-data/backups/backup.log 2>&1
 *
 * This script is committed to the repo, so it reaches the Pi via `git pull`.
 */
const os = require('os');
const path = require('path');
const fs = require('fs');

// Resolve better-sqlite3 whether run from repo root (root deps) or via server deps.
let Database;
try {
  Database = require('better-sqlite3');
} catch {
  Database = require(path.join(__dirname, '..', 'server', 'node_modules', 'better-sqlite3'));
}

const KEEP = Number(process.env.KEEP_BACKUPS || 14);
// Second instances point this at their own data dir, e.g.
//   WTWT_DATA_DIR=~/movie-night-montreal-data node scripts/pi-db-backup.cjs
const dataDir = process.env.WTWT_DATA_DIR
  ? process.env.WTWT_DATA_DIR.replace(/^~/, os.homedir())
  : path.join(os.homedir(), 'movie-night-data');
const srcDb = path.join(dataDir, 'movies.db');
const backupDir = path.join(dataDir, 'backups');

fs.mkdirSync(backupDir, { recursive: true });

// → movies-prod-YYYYMMDD-HHMMSS.db
const stamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
const dest = path.join(backupDir, `movies-prod-${stamp}.db`);

const db = new Database(srcDb);
// Read the count from the source connection so we don't open (and leave
// -wal/-shm sidecars on) the backup file.
const n = db.prepare('SELECT COUNT(*) n FROM viewings').get().n;
db.backup(dest)
  .then(() => {
    db.close();

    // Prune: keep the most recent KEEP automated backups (and any stray sidecars).
    const files = fs
      .readdirSync(backupDir)
      .filter((f) => /^movies-prod-\d{8}-\d{6}\.db$/.test(f))
      .sort()
      .reverse();
    for (const f of files.slice(KEEP)) {
      for (const ext of ['', '-wal', '-shm']) {
        try {
          fs.unlinkSync(path.join(backupDir, f + ext));
        } catch {}
      }
    }

    console.log(
      `[${new Date().toISOString()}] backup ok → ${path.basename(dest)} (${n} viewings); kept ${Math.min(files.length, KEEP)} backups`
    );
  })
  .catch((err) => {
    console.error(`[${new Date().toISOString()}] BACKUP FAILED: ${err.message}`);
    process.exit(1);
  });
