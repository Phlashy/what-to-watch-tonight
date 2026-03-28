const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { createTestDb, seedTestData } = require('./helpers');

describe('Shortlists', () => {
  let db, ids;

  before(() => {
    db = createTestDb();
    ids = seedTestData(db);
  });

  describe('adding shortlists', () => {
    it('creates a shortlist entry', () => {
      const result = db.prepare(
        "INSERT INTO shortlists (title_id, person, context) VALUES (?, 'Gordon', 'family')"
      ).run(ids.titles.princessBride);

      const entry = db.prepare('SELECT * FROM shortlists WHERE id = ?').get(result.lastInsertRowid);
      assert.equal(entry.title_id, ids.titles.princessBride);
      assert.equal(entry.person, 'Gordon');
      assert.equal(entry.context, 'family');
    });

    it('allows multiple people to star the same title in same context', () => {
      db.prepare("INSERT OR IGNORE INTO shortlists (title_id, person, context) VALUES (?, 'Gordon', 'family')").run(ids.titles.spiritedAway);
      db.prepare("INSERT INTO shortlists (title_id, person, context) VALUES (?, 'Nupur', 'family')").run(ids.titles.spiritedAway);
      db.prepare("INSERT INTO shortlists (title_id, person, context) VALUES (?, 'Arianne', 'family')").run(ids.titles.spiritedAway);

      const people = db.prepare("SELECT person FROM shortlists WHERE title_id = ? AND context = 'family'").all(ids.titles.spiritedAway);
      assert.ok(people.length >= 3);
    });

    it('allows same person to star same title in different contexts', () => {
      db.prepare("INSERT INTO shortlists (title_id, person, context) VALUES (?, 'Gordon', 'solo')").run(ids.titles.breakingBad);
      db.prepare("INSERT INTO shortlists (title_id, person, context) VALUES (?, 'Gordon', 'nupur')").run(ids.titles.breakingBad);

      const entries = db.prepare("SELECT * FROM shortlists WHERE title_id = ? AND person = 'Gordon'").all(ids.titles.breakingBad);
      assert.equal(entries.length, 2);
    });

    it('rejects duplicate (title_id, person, context) — UNIQUE constraint', () => {
      db.prepare("INSERT OR IGNORE INTO shortlists (title_id, person, context) VALUES (?, 'Davin', 'family')").run(ids.titles.asterix);

      assert.throws(() => {
        db.prepare("INSERT INTO shortlists (title_id, person, context) VALUES (?, 'Davin', 'family')").run(ids.titles.asterix);
      }, /UNIQUE/);
    });
  });

  describe('toggle behavior', () => {
    it('removes an existing shortlist (toggle off)', () => {
      // Add then toggle off
      db.prepare("INSERT OR IGNORE INTO shortlists (title_id, person, context) VALUES (?, 'Nupur', 'nupur')").run(ids.titles.princessBride);
      const existing = db.prepare("SELECT id FROM shortlists WHERE title_id = ? AND person = 'Nupur' AND context = 'nupur'").get(ids.titles.princessBride);
      assert.ok(existing, 'should exist before toggle');

      db.prepare('DELETE FROM shortlists WHERE id = ?').run(existing.id);
      const after = db.prepare("SELECT id FROM shortlists WHERE title_id = ? AND person = 'Nupur' AND context = 'nupur'").get(ids.titles.princessBride);
      assert.equal(after, undefined);
    });

    it('adds when not existing (toggle on)', () => {
      const existing = db.prepare("SELECT id FROM shortlists WHERE title_id = ? AND person = 'Arianne' AND context = 'family'").get(ids.titles.breakingBad);
      assert.equal(existing, undefined); // shouldn't exist yet

      db.prepare("INSERT INTO shortlists (title_id, person, context) VALUES (?, 'Arianne', 'family')").run(ids.titles.breakingBad);
      const after = db.prepare("SELECT * FROM shortlists WHERE title_id = ? AND person = 'Arianne' AND context = 'family'").get(ids.titles.breakingBad);
      assert.ok(after);
    });
  });

  describe('querying by context', () => {
    it('returns shortlists grouped by title_id for a context', () => {
      // Ensure data exists
      db.prepare("INSERT OR IGNORE INTO shortlists (title_id, person, context) VALUES (?, 'Gordon', 'family')").run(ids.titles.princessBride);
      db.prepare("INSERT OR IGNORE INTO shortlists (title_id, person, context) VALUES (?, 'Davin', 'family')").run(ids.titles.princessBride);

      const items = db.prepare(`
        SELECT s.*, t.title FROM shortlists s
        JOIN titles t ON s.title_id = t.id
        WHERE s.context = 'family' ORDER BY s.created_at ASC
      `).all();

      // Group by title_id
      const grouped = {};
      for (const row of items) {
        if (!grouped[row.title_id]) grouped[row.title_id] = [];
        grouped[row.title_id].push(row.person);
      }

      // Princess Bride should have Gordon + Davin (at least)
      assert.ok(grouped[ids.titles.princessBride]);
      assert.ok(grouped[ids.titles.princessBride].includes('Gordon'));
      assert.ok(grouped[ids.titles.princessBride].includes('Davin'));
    });
  });

  describe('known bug: context mismatch', () => {
    it('toggle fails when context sent differs from stored context', () => {
      // This test documents the root cause of Bug #1 (Davin Asterix star)
      // Shortlist created under "family" context:
      db.prepare("INSERT OR IGNORE INTO shortlists (title_id, person, context) VALUES (?, 'Davin', 'family')").run(ids.titles.asterix);

      // But toggle tries to find it under a different context (e.g. mismatched):
      const wrongContext = db.prepare(
        "SELECT id FROM shortlists WHERE title_id = ? AND person = 'Davin' AND context = 'arianne'"
      ).get(ids.titles.asterix);

      assert.equal(wrongContext, undefined, 'Lookup with wrong context should find nothing');

      // The correct context lookup works:
      const correctContext = db.prepare(
        "SELECT id FROM shortlists WHERE title_id = ? AND person = 'Davin' AND context = 'family'"
      ).get(ids.titles.asterix);
      assert.ok(correctContext, 'Lookup with correct context should find the entry');
    });
  });
});
