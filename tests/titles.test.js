const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { createTestDb, seedTestData } = require('./helpers');

describe('Titles', () => {
  let db, ids;

  before(() => {
    db = createTestDb();
    ids = seedTestData(db);
  });

  describe('creation', () => {
    it('inserts a title with all fields', () => {
      const result = db.prepare(`
        INSERT INTO titles (title, type, year, director, cast, genre, runtime_minutes, poster_url, synopsis)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('Inception', 'movie', 2010, 'Christopher Nolan',
        JSON.stringify(['Leonardo DiCaprio']), JSON.stringify(['Sci-Fi', 'Thriller']),
        148, 'http://example.com/inception.jpg', 'Dreams within dreams');

      const title = db.prepare('SELECT * FROM titles WHERE id = ?').get(result.lastInsertRowid);
      assert.equal(title.title, 'Inception');
      assert.equal(title.type, 'movie');
      assert.equal(title.year, 2010);
      assert.equal(title.runtime_minutes, 148);
      assert.deepEqual(JSON.parse(title.cast), ['Leonardo DiCaprio']);
      assert.deepEqual(JSON.parse(title.genre), ['Sci-Fi', 'Thriller']);
    });

    it('requires a title', () => {
      assert.throws(() => {
        db.prepare('INSERT INTO titles (title) VALUES (?)').run(null);
      });
    });

    it('defaults type to movie', () => {
      const result = db.prepare("INSERT INTO titles (title) VALUES ('Test Movie')").run();
      const title = db.prepare('SELECT type FROM titles WHERE id = ?').get(result.lastInsertRowid);
      assert.equal(title.type, 'movie');
    });
  });

  describe('queries', () => {
    it('finds titles by LIKE search on title', () => {
      const results = db.prepare("SELECT * FROM titles WHERE title LIKE ?").all('%Princess%');
      assert.equal(results.length, 1);
      assert.equal(results[0].title, 'The Princess Bride');
    });

    it('finds titles by director', () => {
      const results = db.prepare("SELECT * FROM titles WHERE director LIKE ?").all('%Miyazaki%');
      assert.equal(results.length, 1);
      assert.equal(results[0].title, 'Spirited Away');
    });

    it('finds titles by cast (JSON string search)', () => {
      const results = db.prepare("SELECT * FROM titles WHERE titles.cast LIKE ?").all('%Astier%');
      assert.equal(results.length, 1);
      assert.equal(results[0].title, 'Asterix: The Secret of the Magic Potion');
    });

    it('filters by type', () => {
      const shows = db.prepare("SELECT * FROM titles WHERE type = 'show'").all();
      assert.ok(shows.length >= 1);
      assert.ok(shows.every(t => t.type === 'show'));
    });

    it('returns title with viewings and list memberships', () => {
      // Add a viewing for Princess Bride
      const v = db.prepare("INSERT INTO viewings (title_id, date, rating) VALUES (?, '2025-01-15', 9)").run(ids.titles.princessBride);
      db.prepare("INSERT INTO viewing_people (viewing_id, person, role, rating) VALUES (?, 'Gordon', 'chooser', 9)").run(v.lastInsertRowid);

      const title = db.prepare('SELECT * FROM titles WHERE id = ?').get(ids.titles.princessBride);
      assert.ok(title);

      const viewings = db.prepare('SELECT * FROM viewings WHERE title_id = ?').all(ids.titles.princessBride);
      assert.ok(viewings.length >= 1);

      const listMemberships = db.prepare(`
        SELECT li.*, l.name, l.display_name
        FROM list_items li JOIN lists l ON li.list_id = l.id
        WHERE li.title_id = ?
      `).all(ids.titles.princessBride);
      assert.ok(listMemberships.length >= 1);
      assert.equal(listMemberships[0].name, 'family_to_watch');
    });
  });

  describe('updates', () => {
    it('updates title with COALESCE (null fields preserved)', () => {
      db.prepare(`
        UPDATE titles SET
          year = COALESCE(?, year),
          director = COALESCE(?, director)
        WHERE id = ?
      `).run(null, 'Updated Director', ids.titles.princessBride);

      const title = db.prepare('SELECT * FROM titles WHERE id = ?').get(ids.titles.princessBride);
      assert.equal(title.year, 1987); // preserved
      assert.equal(title.director, 'Updated Director'); // updated
    });
  });
});
