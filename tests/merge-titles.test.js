const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createTestDb, seedTestData, createTestApp } = require('./helpers');
const { mergeDuplicateTitles, pickCanonicalId } = require('../server/lib/merge-titles');

// Duplicate titles — two rows for the same film, sharing a tmdb_id.
//
// They came from every "add" path INSERTing unconditionally: search TMDB, pick
// the film, get a second row even though the library already had it. Production
// accumulated 24 such pairs before this was caught. These tests cover both ends
// of the fix: the merge that cleans up existing pairs (server/lib/merge-titles.js,
// run by migration 006) and the find-or-create that stops new ones.
describe('Duplicate titles', () => {
  let db, app, ids;

  beforeEach(() => {
    db = createTestDb();
    ids = seedTestData(db);
    app = createTestApp(db);
  });

  /** Two rows for the same film, as the old add-path would have produced. */
  function makeDuplicatePair(tmdbId = 1078605) {
    const a = db
      .prepare(
        "INSERT INTO titles (title, type, year, tmdb_id) VALUES ('Weapons', 'movie', 2025, ?)"
      )
      .run(tmdbId).lastInsertRowid;
    // The index is what the migration adds; drop it so we can recreate the mess
    // it exists to prevent.
    db.exec('DROP INDEX IF EXISTS idx_titles_tmdb_id_unique');
    const b = db
      .prepare(
        "INSERT INTO titles (title, type, year, tmdb_id) VALUES ('Weapons', 'movie', 2025, ?)"
      )
      .run(tmdbId).lastInsertRowid;
    return { a, b };
  }

  describe('merging', () => {
    it('keeps one row and deletes the rest', () => {
      const { a, b } = makeDuplicatePair();

      const result = mergeDuplicateTitles(db);

      assert.equal(result.groups, 1);
      assert.equal(result.titlesRemoved, 1);
      const remaining = db
        .prepare('SELECT id FROM titles WHERE id IN (?, ?)')
        .all(a, b)
        .map((r) => r.id);
      assert.deepEqual(remaining, [a], 'the older row survives when neither has history');
    });

    it('keeps whichever row carries the viewings, not simply the older one', () => {
      const { a, b } = makeDuplicatePair();
      db.prepare("INSERT INTO viewings (title_id, date) VALUES (?, '2026-06-24')").run(b);

      assert.equal(pickCanonicalId(db, [a, b]), b);
      mergeDuplicateTitles(db);
      assert.ok(db.prepare('SELECT id FROM titles WHERE id = ?').get(b));
    });

    it('moves viewings, list items, stars, discs and show status onto the survivor', () => {
      const { a, b } = makeDuplicatePair();
      db.prepare("INSERT INTO viewings (title_id, date) VALUES (?, '2026-06-24')").run(a);
      db.prepare('INSERT INTO list_items (list_id, title_id) VALUES (?, ?)').run(ids.lists.solo, b);
      db.prepare(
        "INSERT INTO shortlists (title_id, person, context) VALUES (?, 'Nupur', 'solo')"
      ).run(b);
      db.prepare("INSERT INTO collection (title_id, format) VALUES (?, 'bluray')").run(b);
      db.prepare(
        "INSERT INTO show_status (title_id, person, status) VALUES (?, 'Gordon', 'watching')"
      ).run(b);

      mergeDuplicateTitles(db);

      const count = (table) =>
        db.prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE title_id = ?`).get(a).c;
      assert.equal(count('viewings'), 1);
      assert.equal(count('list_items'), 1);
      assert.equal(count('shortlists'), 1);
      assert.equal(count('collection'), 1);
      assert.equal(count('show_status'), 1);
      assert.equal(db.prepare('SELECT COUNT(*) AS c FROM titles WHERE id = ?').get(b).c, 0);
    });

    it('folds a list membership held under BOTH ids into one, keeping the earliest add', () => {
      // Exactly the production state of Weapons: on "Cinema flicks I missed"
      // twice, once per id. A blind UPDATE would hit UNIQUE(list_id, title_id).
      const { a, b } = makeDuplicatePair();
      db.prepare(
        "INSERT INTO list_items (list_id, title_id, added_at, added_by) VALUES (?, ?, '2026-06-02', 'Gordon')"
      ).run(ids.lists.solo, a);
      db.prepare(
        "INSERT INTO list_items (list_id, title_id, added_at, note) VALUES (?, ?, '2026-05-29', 'Cannes buzz')"
      ).run(ids.lists.solo, b);

      mergeDuplicateTitles(db);

      const items = db
        .prepare('SELECT * FROM list_items WHERE list_id = ? AND title_id = ?')
        .all(ids.lists.solo, a);
      assert.equal(items.length, 1, 'one membership, not two');
      assert.equal(items[0].added_at, '2026-05-29', 'keeps the earliest add date');
      assert.equal(items[0].added_by, 'Gordon');
      assert.equal(items[0].note, 'Cannes buzz', 'fills gaps from the row being dropped');
    });

    it('collapses one screening logged under both ids, combining who watched', () => {
      // Andor in production: the same 2022-11-25 viewing on each row.
      const { a, b } = makeDuplicatePair();
      const v1 = db
        .prepare("INSERT INTO viewings (title_id, date, rating) VALUES (?, '2022-11-25', 8)")
        .run(a).lastInsertRowid;
      const v2 = db
        .prepare("INSERT INTO viewings (title_id, date) VALUES (?, '2022-11-25')")
        .run(b).lastInsertRowid;
      db.prepare("INSERT INTO viewing_people (viewing_id, person) VALUES (?, 'Gordon')").run(v1);
      db.prepare("INSERT INTO viewing_people (viewing_id, person) VALUES (?, 'Davin')").run(v2);

      mergeDuplicateTitles(db);

      const viewings = db.prepare('SELECT * FROM viewings WHERE title_id = ?').all(a);
      assert.equal(viewings.length, 1, 'one screening, not two');
      assert.equal(viewings[0].rating, 8, 'the rated entry survives');
      const people = db
        .prepare('SELECT person FROM viewing_people WHERE viewing_id = ? ORDER BY person')
        .all(viewings[0].id)
        .map((r) => r.person);
      assert.deepEqual(people, ['Davin', 'Gordon'], 'watchers from both entries are kept');
    });

    it('leaves two same-day viewings alone when both were already on one row', () => {
      // A deliberate double-watch is the user's data, not a duplicate to clean up.
      const { a, b } = makeDuplicatePair();
      db.prepare("INSERT INTO viewings (title_id, date) VALUES (?, '2026-01-01')").run(a);
      db.prepare("INSERT INTO viewings (title_id, date) VALUES (?, '2026-01-01')").run(a);
      db.prepare("INSERT INTO viewings (title_id, date) VALUES (?, '2026-03-03')").run(b);

      mergeDuplicateTitles(db);

      assert.equal(db.prepare('SELECT COUNT(*) AS c FROM viewings WHERE title_id = ?').get(a).c, 3);
    });

    it('back-fills metadata the surviving row is missing', () => {
      const { a, b } = makeDuplicatePair();
      db.prepare("INSERT INTO viewings (title_id, date) VALUES (?, '2026-06-24')").run(a);
      db.prepare('UPDATE titles SET poster_url = NULL, director = NULL WHERE id = ?').run(a);
      db.prepare(
        "UPDATE titles SET poster_url = 'https://img/w.jpg', director = 'Zach Cregger' WHERE id = ?"
      ).run(b);

      mergeDuplicateTitles(db);

      const kept = db.prepare('SELECT * FROM titles WHERE id = ?').get(a);
      assert.equal(kept.poster_url, 'https://img/w.jpg');
      assert.equal(kept.director, 'Zach Cregger');
    });

    it('does nothing on a clean database, and leaves un-matched titles untouched', () => {
      // Several titles have no TMDB match; NULLs must not count as duplicates.
      const before = db.prepare('SELECT COUNT(*) AS c FROM titles').get().c;
      const result = mergeDuplicateTitles(db);
      assert.equal(result.groups, 0);
      assert.equal(db.prepare('SELECT COUNT(*) AS c FROM titles').get().c, before);
    });
  });

  describe('the UNIQUE index from migration 006', () => {
    it('rejects a second row for the same tmdb_id', () => {
      db.prepare("INSERT INTO titles (title, tmdb_id) VALUES ('Weapons', 1078605)").run();
      assert.throws(
        () => db.prepare("INSERT INTO titles (title, tmdb_id) VALUES ('Weapons', 1078605)").run(),
        /UNIQUE constraint failed/
      );
    });

    it('still allows any number of titles with no TMDB match', () => {
      db.prepare("INSERT INTO titles (title, tmdb_id) VALUES ('Home video A', NULL)").run();
      db.prepare("INSERT INTO titles (title, tmdb_id) VALUES ('Home video B', NULL)").run();
      assert.equal(
        db.prepare('SELECT COUNT(*) AS c FROM titles WHERE tmdb_id IS NULL').get().c >= 2,
        true
      );
    });
  });

  describe('POST /api/titles', () => {
    it('returns the existing title instead of creating a second one', async () => {
      const first = await request(app)
        .post('/api/titles')
        .send({ title: 'Weapons', type: 'movie', tmdb_id: 1078605 });
      assert.equal(first.status, 200);
      assert.ok(!first.body.existing);

      const second = await request(app)
        .post('/api/titles')
        .send({ title: 'Weapons', type: 'movie', tmdb_id: 1078605 });
      assert.equal(second.status, 200);
      assert.equal(second.body.id, first.body.id, 'same row, not a duplicate');
      assert.equal(second.body.existing, true, 'flagged so the client can skip re-enriching');

      assert.equal(
        db.prepare('SELECT COUNT(*) AS c FROM titles WHERE tmdb_id = 1078605').get().c,
        1
      );
    });

    it('still creates separate rows for titles with no TMDB id', async () => {
      const a = await request(app).post('/api/titles').send({ title: 'Family camcorder tape' });
      const b = await request(app).post('/api/titles').send({ title: 'Family camcorder tape' });
      assert.notEqual(a.body.id, b.body.id);
    });
  });
});
