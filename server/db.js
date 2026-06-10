const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const os = require('os');

function expandPath(p) {
  return p.replace(/^~/, os.homedir());
}

const dbPath = expandPath(
  process.env.DB_PATH || path.join(os.homedir(), 'movie-night-data', 'movies.db')
);
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Run all pending migrations (see server/migrations/ and server/lib/migrate.js).
require('./lib/migrate').migrate(db);

module.exports = db;
