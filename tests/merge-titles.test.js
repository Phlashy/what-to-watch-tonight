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

  // Merging by hand — the way out of a wrong TMDB match that can't be re-pointed
  // because the right film is already in the library (the 409 from the enrich
  // route). The real case: a Hercules row carrying two viewings turned out to be
  // the wrong Hercules, and the animated one was already there.
  describe('POST /api/titles/:id/merge-into/:targetId', () => {
    it('moves history onto the target and deletes the source', async () => {
      const wrong = db
        .prepare("INSERT INTO titles (title, year, tmdb_id) VALUES ('Hercules', 2014, 184315)")
        .run().lastInsertRowid;
      const right = db
        .prepare("INSERT INTO titles (title, year, tmdb_id) VALUES ('Hercules', 1997, 11970)")
        .run().lastInsertRowid;
      const v = db
        .prepare("INSERT INTO viewings (title_id, date) VALUES (?, '2025-01-03')")
        .run(wrong).lastInsertRowid;
      db.prepare("INSERT INTO viewing_people (viewing_id, person) VALUES (?, 'Davin')").run(v);
      db.prepare('INSERT INTO list_items (list_id, title_id) VALUES (?, ?)').run(
        ids.lists.family,
        wrong
      );

      const res = await request(app).post(`/api/titles/${wrong}/merge-into/${right}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.moved.viewings, 1);
      assert.equal(res.body.into.id, right);
      assert.equal(db.prepare('SELECT COUNT(*) AS c FROM titles WHERE id = ?').get(wrong).c, 0);
      assert.equal(
        db.prepare('SELECT COUNT(*) AS c FROM viewings WHERE title_id = ?').get(right).c,
        1
      );
      assert.equal(
        db.prepare('SELECT COUNT(*) AS c FROM list_items WHERE title_id = ?').get(right).c,
        1
      );
      // The watcher rides along with the viewing.
      assert.equal(
        db.prepare('SELECT person FROM viewing_people WHERE viewing_id = ?').get(v).person,
        'Davin'
      );
    });

    it('keeps the target the user chose, even though it has no history', () => {
      // The automatic sweep would keep the row with the viewings — which here is
      // precisely the wrong one. The explicit target must win.
      const wrong = db
        .prepare("INSERT INTO titles (title, tmdb_id) VALUES ('Hercules (wrong)', 184315)")
        .run().lastInsertRowid;
      const right = db
        .prepare("INSERT INTO titles (title, tmdb_id) VALUES ('Hercules (right)', 11970)")
        .run().lastInsertRowid;
      db.prepare("INSERT INTO viewings (title_id, date) VALUES (?, '2025-01-03')").run(wrong);

      assert.equal(pickCanonicalId(db, [wrong, right]), wrong, 'the heuristic would pick wrong');

      return request(app)
        .post(`/api/titles/${wrong}/merge-into/${right}`)
        .then(() => {
          assert.ok(db.prepare('SELECT id FROM titles WHERE id = ?').get(right));
          assert.equal(db.prepare('SELECT COUNT(*) AS c FROM titles WHERE id = ?').get(wrong).c, 0);
        });
    });

    it('refuses to merge a title into itself', async () => {
      const res = await request(app).post(
        `/api/titles/${ids.titles.princessBride}/merge-into/${ids.titles.princessBride}`
      );
      assert.equal(res.status, 400);
    });

    it('404s when either title is missing', async () => {
      const a = await request(app).post(`/api/titles/999999/merge-into/${ids.titles.spiritedAway}`);
      const b = await request(app).post(`/api/titles/${ids.titles.spiritedAway}/merge-into/999999`);
      assert.equal(a.status, 404);
      assert.equal(b.status, 404);
    });
  });

  // Deleting outright — for entries that shouldn't exist at all (a mis-scanned
  // DVD, a bad match logged by mistake).
  describe('DELETE /api/titles/:id', () => {
    it('removes the title and everything hanging off it', async () => {
      const id = db
        .prepare("INSERT INTO titles (title) VALUES ('Phantom DVD')")
        .run().lastInsertRowid;
      const v = db
        .prepare("INSERT INTO viewings (title_id, date) VALUES (?, '2025-05-05')")
        .run(id).lastInsertRowid;
      db.prepare("INSERT INTO viewing_people (viewing_id, person) VALUES (?, 'Gordon')").run(v);
      db.prepare('INSERT INTO list_items (list_id, title_id) VALUES (?, ?)').run(
        ids.lists.solo,
        id
      );
      db.prepare(
        "INSERT INTO shortlists (title_id, person, context) VALUES (?, 'Gordon', 'solo')"
      ).run(id);
      db.prepare("INSERT INTO collection (title_id, format) VALUES (?, 'dvd')").run(id);
      db.prepare(
        "INSERT INTO show_status (title_id, person, status) VALUES (?, 'Gordon', 'watching')"
      ).run(id);

      const res = await request(app).delete(`/api/titles/${id}`);

      assert.equal(res.status, 200);
      assert.deepEqual(res.body.removed, {
        viewings: 1,
        listItems: 1,
        shortlists: 1,
        collection: 1,
        showStatus: 1,
      });
      assert.equal(db.prepare('SELECT COUNT(*) AS c FROM titles WHERE id = ?').get(id).c, 0);
      for (const table of ['viewings', 'list_items', 'shortlists', 'collection', 'show_status']) {
        assert.equal(
          db.prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE title_id = ?`).get(id).c,
          0,
          `${table} rows should be gone`
        );
      }
      // viewing_people hangs off the viewing, not the title — it must go too, or
      // it's orphaned rows forever.
      assert.equal(
        db.prepare('SELECT COUNT(*) AS c FROM viewing_people WHERE viewing_id = ?').get(v).c,
        0
      );
    });

    it('reports the footprint first so the confirmation can name the cost', async () => {
      const id = db
        .prepare("INSERT INTO titles (title) VALUES ('Phantom DVD')")
        .run().lastInsertRowid;
      db.prepare("INSERT INTO viewings (title_id, date) VALUES (?, '2025-05-05')").run(id);
      db.prepare("INSERT INTO collection (title_id, format) VALUES (?, 'dvd')").run(id);

      const res = await request(app).get(`/api/titles/${id}/footprint`);
      assert.equal(res.status, 200);
      assert.equal(res.body.viewings, 1);
      assert.equal(res.body.collection, 1);
      assert.equal(res.body.listItems, 0);
    });

    it('404s for a title that is already gone', async () => {
      assert.equal((await request(app).delete('/api/titles/999999')).status, 404);
      assert.equal((await request(app).get('/api/titles/999999/footprint')).status, 404);
    });

    it('leaves other titles untouched', async () => {
      const before = db.prepare('SELECT COUNT(*) AS c FROM titles').get().c;
      const id = db
        .prepare("INSERT INTO titles (title) VALUES ('Phantom DVD')")
        .run().lastInsertRowid;
      await request(app).delete(`/api/titles/${id}`);
      assert.equal(db.prepare('SELECT COUNT(*) AS c FROM titles').get().c, before);
    });
  });
});
