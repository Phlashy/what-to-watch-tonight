const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { createTestDb, seedTestData } = require('./helpers');

describe('Collection', () => {
  let db, ids;

  before(() => {
    db = createTestDb();
    ids = seedTestData(db);
  });

  describe('adding to collection', () => {
    it('adds a DVD entry', () => {
      const result = db.prepare(
        "INSERT INTO collection (title_id, format) VALUES (?, 'dvd')"
      ).run(ids.titles.princessBride);

      const entry = db.prepare('SELECT * FROM collection WHERE id = ?').get(result.lastInsertRowid);
      assert.equal(entry.format, 'dvd');
      assert.equal(entry.title_id, ids.titles.princessBride);
    });

    it('adds a digital entry with platform', () => {
      const result = db.prepare(
        "INSERT INTO collection (title_id, format, platform, notes) VALUES (?, 'digital', 'iTunes', 'HD version')"
      ).run(ids.titles.spiritedAway);

      const entry = db.prepare('SELECT * FROM collection WHERE id = ?').get(result.lastInsertRowid);
      assert.equal(entry.format, 'digital');
      assert.equal(entry.platform, 'iTunes');
      assert.equal(entry.notes, 'HD version');
    });

    it('rejects duplicate format for same title (UNIQUE constraint)', () => {
      db.prepare("INSERT OR IGNORE INTO collection (title_id, format) VALUES (?, 'bluray')").run(ids.titles.princessBride);

      assert.throws(() => {
        db.prepare("INSERT INTO collection (title_id, format) VALUES (?, 'bluray')").run(ids.titles.princessBride);
      }, /UNIQUE/);
    });

    it('allows different formats for same title', () => {
      db.prepare("INSERT OR IGNORE INTO collection (title_id, format) VALUES (?, 'dvd')").run(ids.titles.breakingBad);
      assert.doesNotThrow(() => {
        db.prepare("INSERT INTO collection (title_id, format) VALUES (?, 'digital')").run(ids.titles.breakingBad);
      });
    });
  });

  describe('querying', () => {
    it('returns all collection entries with title info', () => {
      const items = db.prepare(`
        SELECT c.*, t.title, t.poster_url, t.year, t.type
        FROM collection c JOIN titles t ON c.title_id = t.id
        ORDER BY c.added_at DESC
      `).all();
      assert.ok(items.length >= 1);
      assert.ok(items[0].title); // has joined title data
    });

    it('returns entries for a specific title', () => {
      const items = db.prepare('SELECT * FROM collection WHERE title_id = ?').all(ids.titles.princessBride);
      assert.ok(items.length >= 1);
    });
  });

  describe('deletion', () => {
    it('removes a collection entry', () => {
      const result = db.prepare(
        "INSERT INTO collection (title_id, format) VALUES (?, 'dvd')"
      ).run(ids.titles.asterix);

      db.prepare('DELETE FROM collection WHERE id = ?').run(result.lastInsertRowid);
      assert.equal(
        db.prepare('SELECT * FROM collection WHERE id = ?').get(result.lastInsertRowid),
        undefined
      );
    });
  });
});
