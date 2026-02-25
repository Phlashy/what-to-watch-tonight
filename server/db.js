const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const os = require('os');

function expandPath(p) {
  return p.replace(/^~/, os.homedir());
}

const dbPath = expandPath(process.env.DB_PATH || path.join(os.homedir(), 'movie-night-data', 'movies.db'));
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Run migrations
const migrationPath = path.join(__dirname, 'migrations', '001_initial.sql');
const migration = fs.readFileSync(migrationPath, 'utf8');
db.exec(migration);

// Incremental migrations (safe to re-run — SQLite throws on duplicate column, we ignore it)
try { db.exec('ALTER TABLE list_items ADD COLUMN added_by TEXT'); } catch {}
try { db.exec('ALTER TABLE viewing_people ADD COLUMN rating INTEGER'); } catch {}
try { db.exec('ALTER TABLE titles ADD COLUMN watch_providers TEXT'); } catch {}
try { db.exec('ALTER TABLE titles ADD COLUMN watch_providers_updated_at TEXT'); } catch {}

// Collection table for tracking physical/digital media ownership
db.exec(`
  CREATE TABLE IF NOT EXISTS collection (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title_id INTEGER NOT NULL REFERENCES titles(id),
    format TEXT NOT NULL,
    platform TEXT,
    notes TEXT,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(title_id, format)
  )
`);
db.exec('CREATE INDEX IF NOT EXISTS idx_collection_title_id ON collection(title_id)');

module.exports = db;
