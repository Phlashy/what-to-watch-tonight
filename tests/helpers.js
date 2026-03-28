/**
 * Test helpers — provides an isolated in-memory SQLite database
 * and lightweight request helpers for testing Express routes.
 */
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const MIGRATION_PATH = path.join(__dirname, '..', 'server', 'migrations', '001_initial.sql');
const MIGRATION_SQL = fs.readFileSync(MIGRATION_PATH, 'utf8');

/**
 * Create a fresh in-memory database with the full schema applied.
 * Each test suite gets its own isolated DB — no cross-contamination.
 * @returns {import('better-sqlite3').Database}
 */
function createTestDb() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(MIGRATION_SQL);

  // Incremental migrations (mirrors server/db.js)
  try { db.exec('ALTER TABLE list_items ADD COLUMN added_by TEXT'); } catch {}
  try { db.exec('ALTER TABLE viewing_people ADD COLUMN rating INTEGER'); } catch {}
  try { db.exec('ALTER TABLE titles ADD COLUMN watch_providers TEXT'); } catch {}
  try { db.exec('ALTER TABLE titles ADD COLUMN watch_providers_updated_at TEXT'); } catch {}

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

  return db;
}

/**
 * Seed common test data: a few titles, a list, and people.
 * Returns the IDs for convenient reference in tests.
 */
function seedTestData(db) {
  // People
  db.prepare("INSERT INTO people (name, display_name) VALUES (?, ?)").run('Gordon', 'Gordon');
  db.prepare("INSERT INTO people (name, display_name) VALUES (?, ?)").run('Nupur', 'Nupur');
  db.prepare("INSERT INTO people (name, display_name) VALUES (?, ?)").run('Arianne', 'Arianne');
  db.prepare("INSERT INTO people (name, display_name) VALUES (?, ?)").run('Davin', 'Davin');

  // Lists
  const familyList = db.prepare("INSERT INTO lists (name, display_name, description) VALUES ('family_to_watch', 'Family Movie Night', 'Friday night picks')").run();
  const soloList = db.prepare("INSERT INTO lists (name, display_name, description) VALUES ('solo_gordon', 'Solo Gordon', 'Gordon solo picks')").run();
  const nupurList = db.prepare("INSERT INTO lists (name, display_name, description) VALUES ('with_nupur', 'Me + Nupur', 'For watching with Nupur')").run();

  // Titles
  const t1 = db.prepare(`
    INSERT INTO titles (title, type, year, director, genre, runtime_minutes)
    VALUES ('The Princess Bride', 'movie', 1987, 'Rob Reiner', '["Adventure","Comedy","Romance"]', 98)
  `).run();
  const t2 = db.prepare(`
    INSERT INTO titles (title, type, year, director, genre, runtime_minutes)
    VALUES ('Spirited Away', 'movie', 2001, 'Hayao Miyazaki', '["Animation","Adventure","Family"]', 125)
  `).run();
  const t3 = db.prepare(`
    INSERT INTO titles (title, type, year, director, genre, runtime_minutes)
    VALUES ('Breaking Bad', 'show', 2008, 'Vince Gilligan', '["Crime","Drama","Thriller"]', 49)
  `).run();
  const t4 = db.prepare(`
    INSERT INTO titles (title, type, year, director, genre, cast, synopsis)
    VALUES ('Asterix: The Secret of the Magic Potion', 'movie', 2018, 'Alexandre Astier', '["Animation","Comedy"]', '["Alexandre Astier"]', 'Asterix adventure film')
  `).run();

  // List items
  const li1 = db.prepare("INSERT INTO list_items (list_id, title_id, priority) VALUES (?, ?, 1)").run(familyList.lastInsertRowid, t1.lastInsertRowid);
  const li2 = db.prepare("INSERT INTO list_items (list_id, title_id, priority) VALUES (?, ?, 2)").run(familyList.lastInsertRowid, t2.lastInsertRowid);
  const li3 = db.prepare("INSERT INTO list_items (list_id, title_id, priority, added_by) VALUES (?, ?, 1, 'Gordon')").run(soloList.lastInsertRowid, t3.lastInsertRowid);

  return {
    lists: {
      family: familyList.lastInsertRowid,
      solo: soloList.lastInsertRowid,
      nupur: nupurList.lastInsertRowid,
    },
    titles: {
      princessBride: t1.lastInsertRowid,
      spiritedAway: t2.lastInsertRowid,
      breakingBad: t3.lastInsertRowid,
      asterix: t4.lastInsertRowid,
    },
    listItems: {
      princessBrideFamily: li1.lastInsertRowid,
      spiritedAwayFamily: li2.lastInsertRowid,
      breakingBadSolo: li3.lastInsertRowid,
    },
  };
}

module.exports = { createTestDb, seedTestData };
