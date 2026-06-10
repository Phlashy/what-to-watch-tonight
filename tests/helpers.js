/**
 * Test helpers — provides an isolated in-memory SQLite database
 * and lightweight request helpers for testing Express routes.
 */
const Database = require('better-sqlite3');
// Use the SAME express the route modules resolve (it lives in server/node_modules),
// so the test app and the routers share one express instance.
const express = require('../server/node_modules/express');
const { migrate } = require('../server/lib/migrate');

/**
 * Deterministic family config for tests — decoupled from family.config.json so
 * tests don't break when the real config changes. Lists match seedTestData().
 */
const TEST_CONFIG = {
  familyName: 'Test',
  members: [{ name: 'Gordon' }, { name: 'Nupur' }, { name: 'Arianne' }, { name: 'Davin' }],
  guests: [],
  rotation: ['Davin', 'Arianne', 'Nupur', 'Gordon'],
  contexts: [
    { id: 'family', lists: ['family_to_watch'] },
    { id: 'solo', lists: ['solo_gordon'] },
    { id: 'nupur', lists: ['with_nupur', 'adult_movies'] },
  ],
  lists: [],
};

/**
 * Create a fresh in-memory database with the full schema applied via the SAME
 * migration runner production uses — so the test schema can never drift from real.
 * Each test suite gets its own isolated DB — no cross-contamination.
 * @returns {import('better-sqlite3').Database}
 */
function createTestDb() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

/**
 * Seed common test data: a few titles, a list, and people.
 * Returns the IDs for convenient reference in tests.
 */
function seedTestData(db) {
  // People
  db.prepare('INSERT INTO people (name, display_name) VALUES (?, ?)').run('Gordon', 'Gordon');
  db.prepare('INSERT INTO people (name, display_name) VALUES (?, ?)').run('Nupur', 'Nupur');
  db.prepare('INSERT INTO people (name, display_name) VALUES (?, ?)').run('Arianne', 'Arianne');
  db.prepare('INSERT INTO people (name, display_name) VALUES (?, ?)').run('Davin', 'Davin');

  // Lists
  const familyList = db
    .prepare(
      "INSERT INTO lists (name, display_name, description) VALUES ('family_to_watch', 'Family Movie Night', 'Friday night picks')"
    )
    .run();
  const soloList = db
    .prepare(
      "INSERT INTO lists (name, display_name, description) VALUES ('solo_gordon', 'Solo Gordon', 'Gordon solo picks')"
    )
    .run();
  const nupurList = db
    .prepare(
      "INSERT INTO lists (name, display_name, description) VALUES ('with_nupur', 'Me + Nupur', 'For watching with Nupur')"
    )
    .run();

  // Titles
  const t1 = db
    .prepare(
      `
    INSERT INTO titles (title, type, year, director, genre, runtime_minutes)
    VALUES ('The Princess Bride', 'movie', 1987, 'Rob Reiner', '["Adventure","Comedy","Romance"]', 98)
  `
    )
    .run();
  const t2 = db
    .prepare(
      `
    INSERT INTO titles (title, type, year, director, genre, runtime_minutes)
    VALUES ('Spirited Away', 'movie', 2001, 'Hayao Miyazaki', '["Animation","Adventure","Family"]', 125)
  `
    )
    .run();
  const t3 = db
    .prepare(
      `
    INSERT INTO titles (title, type, year, director, genre, runtime_minutes)
    VALUES ('Breaking Bad', 'show', 2008, 'Vince Gilligan', '["Crime","Drama","Thriller"]', 49)
  `
    )
    .run();
  const t4 = db
    .prepare(
      `
    INSERT INTO titles (title, type, year, director, genre, cast, synopsis)
    VALUES ('Asterix: The Secret of the Magic Potion', 'movie', 2018, 'Alexandre Astier', '["Animation","Comedy"]', '["Alexandre Astier"]', 'Asterix adventure film')
  `
    )
    .run();

  // List items
  const li1 = db
    .prepare('INSERT INTO list_items (list_id, title_id, priority) VALUES (?, ?, 1)')
    .run(familyList.lastInsertRowid, t1.lastInsertRowid);
  const li2 = db
    .prepare('INSERT INTO list_items (list_id, title_id, priority) VALUES (?, ?, 2)')
    .run(familyList.lastInsertRowid, t2.lastInsertRowid);
  const li3 = db
    .prepare(
      "INSERT INTO list_items (list_id, title_id, priority, added_by) VALUES (?, ?, 1, 'Gordon')"
    )
    .run(soloList.lastInsertRowid, t3.lastInsertRowid);

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

/**
 * Build an Express app that mounts the REAL route handlers against the given
 * (in-memory) database, so integration tests exercise actual handler code —
 * validation, status codes, side effects, and all — not reimplemented SQL.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {object} [config] - family config (defaults to TEST_CONFIG)
 * @returns {import('express').Express}
 */
function createTestApp(db, config = TEST_CONFIG) {
  const app = express();
  app.use(express.json({ limit: '256kb' }));
  app.use(require('../server/lib/validate').limitBodyStrings);

  const contextListMap = {};
  for (const ctx of config.contexts) contextListMap[ctx.id] = ctx.lists;

  app.locals.db = db;
  app.locals.familyConfig = config;
  app.locals.contextListMap = contextListMap;

  app.use('/api/what-to-watch', require('../server/routes/what-to-watch'));
  app.use('/api/viewings', require('../server/routes/viewings'));
  app.use('/api/lists', require('../server/routes/lists'));
  app.use('/api/family-rotation', require('../server/routes/rotation').router);
  app.use('/api/titles', require('../server/routes/titles'));
  app.use('/api/collection', require('../server/routes/collection'));
  app.use('/api/shortlists', require('../server/routes/shortlists'));
  app.use('/api/show-status', require('../server/routes/show-status'));
  app.use('/api/stats', require('../server/routes/stats'));

  // Mirror the production global error handler so thrown errors become JSON.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    res.status(err.status || 500).json({ error: err.message });
  });

  return app;
}

module.exports = { createTestDb, seedTestData, createTestApp, TEST_CONFIG };
