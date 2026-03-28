const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { createTestDb, seedTestData } = require('./helpers');

describe('Viewings', () => {
  let db, ids;

  before(() => {
    db = createTestDb();
    ids = seedTestData(db);
  });

  describe('creation', () => {
    it('inserts a viewing with date, rating, notes, and tags', () => {
      const result = db.prepare(`
        INSERT INTO viewings (title_id, date, date_precision, rating, notes, tags)
        VALUES (?, '2025-03-15', 'day', 8, 'Great movie!', ?)
      `).run(ids.titles.princessBride, JSON.stringify(['family_movie_night']));

      const viewing = db.prepare('SELECT * FROM viewings WHERE id = ?').get(result.lastInsertRowid);
      assert.equal(viewing.title_id, ids.titles.princessBride);
      assert.equal(viewing.date, '2025-03-15');
      assert.equal(viewing.rating, 8);
      assert.equal(viewing.notes, 'Great movie!');
      assert.deepEqual(JSON.parse(viewing.tags), ['family_movie_night']);
    });

    it('allows null date and defaults date_precision to day', () => {
      const result = db.prepare(`
        INSERT INTO viewings (title_id) VALUES (?)
      `).run(ids.titles.spiritedAway);

      const viewing = db.prepare('SELECT * FROM viewings WHERE id = ?').get(result.lastInsertRowid);
      assert.equal(viewing.date, null);
      assert.equal(viewing.date_precision, 'day');
    });
  });

  describe('viewing_people', () => {
    it('links people to a viewing with roles and per-person ratings', () => {
      const v = db.prepare("INSERT INTO viewings (title_id, date) VALUES (?, '2025-02-01')").run(ids.titles.princessBride);
      const vid = v.lastInsertRowid;

      db.prepare("INSERT INTO viewing_people (viewing_id, person, role, rating) VALUES (?, 'Gordon', 'chooser', 9)").run(vid);
      db.prepare("INSERT INTO viewing_people (viewing_id, person, role, rating) VALUES (?, 'Nupur', 'viewer', 7)").run(vid);
      db.prepare("INSERT INTO viewing_people (viewing_id, person, role, rating) VALUES (?, 'Arianne', 'viewer', 8)").run(vid);

      const people = db.prepare('SELECT * FROM viewing_people WHERE viewing_id = ?').all(vid);
      assert.equal(people.length, 3);

      const gordon = people.find(p => p.person === 'Gordon');
      assert.equal(gordon.role, 'chooser');
      assert.equal(gordon.rating, 9);

      const nupur = people.find(p => p.person === 'Nupur');
      assert.equal(nupur.role, 'viewer');
      assert.equal(nupur.rating, 7);
    });

    it('allows null per-person ratings', () => {
      const v = db.prepare("INSERT INTO viewings (title_id, date) VALUES (?, '2025-02-15')").run(ids.titles.spiritedAway);
      db.prepare("INSERT INTO viewing_people (viewing_id, person, role) VALUES (?, 'Gordon', 'chooser')").run(v.lastInsertRowid);

      const person = db.prepare('SELECT * FROM viewing_people WHERE viewing_id = ?').get(v.lastInsertRowid);
      assert.equal(person.rating, null);
    });
  });

  describe('filtering', () => {
    let viewingIds;

    before(() => {
      // Set up varied data for filter tests
      const v1 = db.prepare("INSERT INTO viewings (title_id, date, rating, notes, tags) VALUES (?, '2025-01-10', 9, 'Loved it', ?)").run(
        ids.titles.princessBride, JSON.stringify(['family_movie_night'])
      );
      db.prepare("INSERT INTO viewing_people (viewing_id, person, role, rating) VALUES (?, 'Gordon', 'chooser', 9)").run(v1.lastInsertRowid);
      db.prepare("INSERT INTO viewing_people (viewing_id, person, role, rating) VALUES (?, 'Davin', 'viewer', 7)").run(v1.lastInsertRowid);

      const v2 = db.prepare("INSERT INTO viewings (title_id, date, rating, tags) VALUES (?, '2025-03-01', 6, '[]')").run(ids.titles.breakingBad);
      db.prepare("INSERT INTO viewing_people (viewing_id, person, role, rating) VALUES (?, 'Gordon', 'chooser', 6)").run(v2.lastInsertRowid);

      viewingIds = { v1: v1.lastInsertRowid, v2: v2.lastInsertRowid };
    });

    it('filters by person', () => {
      const results = db.prepare(`
        SELECT DISTINCT v.id FROM viewings v
        JOIN viewing_people vp ON v.id = vp.viewing_id
        WHERE vp.person = ?
      `).all('Davin');
      assert.ok(results.some(r => r.id === viewingIds.v1));
      assert.ok(!results.some(r => r.id === viewingIds.v2)); // Davin not in v2
    });

    it('filters by date range', () => {
      const results = db.prepare("SELECT * FROM viewings WHERE date >= '2025-02-01' AND date <= '2025-04-01'").all();
      assert.ok(results.length >= 1);
      assert.ok(results.every(v => v.date >= '2025-02-01' && v.date <= '2025-04-01'));
    });

    it('filters by tag', () => {
      const results = db.prepare("SELECT * FROM viewings WHERE tags LIKE ?").all('%family_movie_night%');
      assert.ok(results.length >= 1);
      assert.ok(results.every(v => JSON.parse(v.tags).includes('family_movie_night')));
    });

    it('filters by hasNotes', () => {
      const results = db.prepare("SELECT * FROM viewings WHERE notes IS NOT NULL AND notes != ''").all();
      assert.ok(results.length >= 1);
      assert.ok(results.every(v => v.notes && v.notes.length > 0));
    });
  });

  describe('updates', () => {
    it('updates a viewing preserving unset fields', () => {
      const v = db.prepare("INSERT INTO viewings (title_id, date, rating, notes) VALUES (?, '2025-01-01', 7, 'Original note')").run(ids.titles.princessBride);

      // Update only the notes, using COALESCE to preserve date and rating
      db.prepare(`
        UPDATE viewings SET
          date = COALESCE(?, date),
          notes = COALESCE(?, notes)
        WHERE id = ?
      `).run(null, 'Updated note', v.lastInsertRowid);

      const updated = db.prepare('SELECT * FROM viewings WHERE id = ?').get(v.lastInsertRowid);
      assert.equal(updated.date, '2025-01-01'); // preserved
      assert.equal(updated.notes, 'Updated note'); // updated
      assert.equal(updated.rating, 7); // preserved
    });

    it('replaces viewing_people on update', () => {
      const v = db.prepare("INSERT INTO viewings (title_id, date) VALUES (?, '2025-01-01')").run(ids.titles.spiritedAway);
      db.prepare("INSERT INTO viewing_people (viewing_id, person, role) VALUES (?, 'Gordon', 'chooser')").run(v.lastInsertRowid);

      // Replace people
      db.prepare('DELETE FROM viewing_people WHERE viewing_id = ?').run(v.lastInsertRowid);
      db.prepare("INSERT INTO viewing_people (viewing_id, person, role) VALUES (?, 'Nupur', 'chooser')").run(v.lastInsertRowid);
      db.prepare("INSERT INTO viewing_people (viewing_id, person, role) VALUES (?, 'Gordon', 'viewer')").run(v.lastInsertRowid);

      const people = db.prepare('SELECT * FROM viewing_people WHERE viewing_id = ?').all(v.lastInsertRowid);
      assert.equal(people.length, 2);
      assert.ok(people.some(p => p.person === 'Nupur' && p.role === 'chooser'));
      assert.ok(people.some(p => p.person === 'Gordon' && p.role === 'viewer'));
    });
  });

  describe('deletion', () => {
    it('deletes a viewing and its people', () => {
      const v = db.prepare("INSERT INTO viewings (title_id, date) VALUES (?, '2025-01-01')").run(ids.titles.breakingBad);
      db.prepare("INSERT INTO viewing_people (viewing_id, person, role) VALUES (?, 'Gordon', 'chooser')").run(v.lastInsertRowid);

      db.prepare('DELETE FROM viewing_people WHERE viewing_id = ?').run(v.lastInsertRowid);
      db.prepare('DELETE FROM viewings WHERE id = ?').run(v.lastInsertRowid);

      assert.equal(db.prepare('SELECT * FROM viewings WHERE id = ?').get(v.lastInsertRowid), undefined);
      assert.equal(db.prepare('SELECT * FROM viewing_people WHERE viewing_id = ?').all(v.lastInsertRowid).length, 0);
    });
  });
});
