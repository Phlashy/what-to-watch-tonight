/**
 * Tiny migration runner (no external dependency).
 *
 * Migrations live in server/migrations/ as NNN_name.js modules exporting
 * { up(db), down(db) }. Applied versions are recorded in the schema_migrations
 * table so each runs at most once. `migrate()` is called on startup (server/db.js),
 * by the test harness (tests/helpers.js), and by the seed importer — so all three
 * build the schema from the exact same source, with no drift.
 *
 * Each migration runs inside a transaction. `down()` is provided for reversibility
 * in dev/test (e.g. rolling back the latest change).
 */
const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

function migrationFiles(dir = MIGRATIONS_DIR) {
  return fs
    .readdirSync(dir)
    .filter((f) => /^\d+_.*\.js$/.test(f))
    .sort();
}

function ensureLedger(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
}

/**
 * Apply all pending migrations in order. Returns the list of versions applied.
 * @param {import('better-sqlite3').Database} db
 */
function migrate(db, dir = MIGRATIONS_DIR) {
  ensureLedger(db);
  const applied = new Set(
    db
      .prepare('SELECT version FROM schema_migrations')
      .all()
      .map((r) => r.version)
  );
  const ran = [];
  for (const file of migrationFiles(dir)) {
    const version = file.replace(/\.js$/, '');
    if (applied.has(version)) continue;
    const migration = require(path.join(dir, file));
    db.transaction(() => {
      migration.up(db);
      db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(version);
    })();
    ran.push(version);
  }
  return ran;
}

/**
 * Roll back the most recently applied migration (dev/test convenience).
 * @param {import('better-sqlite3').Database} db
 */
function rollbackLast(db, dir = MIGRATIONS_DIR) {
  ensureLedger(db);
  const last = db
    .prepare('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1')
    .get();
  if (!last) return null;
  const migration = require(path.join(dir, `${last.version}.js`));
  db.transaction(() => {
    if (typeof migration.down === 'function') migration.down(db);
    db.prepare('DELETE FROM schema_migrations WHERE version = ?').run(last.version);
  })();
  return last.version;
}

module.exports = { migrate, rollbackLast, migrationFiles };
