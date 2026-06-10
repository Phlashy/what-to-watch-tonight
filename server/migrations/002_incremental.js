/**
 * 002 — columns and tables added after the initial schema (added_by, per-person
 * ratings, cached watch providers, picked_by, and the collection + show_status
 * tables).
 *
 * `up` is written idempotently because databases created before this migration
 * runner existed already have these objects (they were applied imperatively in
 * server/db.js). This migration is effectively the baseline for those columns:
 * on a fresh DB it creates them; on an existing DB it records itself as applied
 * without disturbing live data.
 */
module.exports = {
  up(db) {
    const addColumn = (table, col, type) => {
      try {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
      } catch (e) {
        if (!/duplicate column name/i.test(e.message)) throw e;
      }
    };

    addColumn('list_items', 'added_by', 'TEXT');
    addColumn('viewing_people', 'rating', 'INTEGER');
    addColumn('titles', 'watch_providers', 'TEXT');
    addColumn('titles', 'watch_providers_updated_at', 'TEXT');
    addColumn('viewings', 'picked_by', 'TEXT');

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

    db.exec(`
      CREATE TABLE IF NOT EXISTS show_status (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title_id INTEGER NOT NULL REFERENCES titles(id),
        person TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('wishlist', 'watching', 'finished', 'dropped')),
        started_date TEXT,
        ended_date TEXT,
        notes TEXT,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(title_id, person)
      )
    `);
    db.exec('CREATE INDEX IF NOT EXISTS idx_show_status_title_id ON show_status(title_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_show_status_person ON show_status(person)');
  },

  down(db) {
    db.exec('DROP TABLE IF EXISTS show_status');
    db.exec('DROP TABLE IF EXISTS collection');
    // SQLite 3.35+ (bundled with better-sqlite3) supports DROP COLUMN.
    for (const [table, col] of [
      ['viewings', 'picked_by'],
      ['titles', 'watch_providers_updated_at'],
      ['titles', 'watch_providers'],
      ['viewing_people', 'rating'],
      ['list_items', 'added_by'],
    ]) {
      try {
        db.exec(`ALTER TABLE ${table} DROP COLUMN ${col}`);
      } catch {
        /* best effort */
      }
    }
  },
};
