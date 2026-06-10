const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createTestDb, seedTestData, createTestApp } = require('./helpers');

// Integration test — exercises the REAL GET /api/what-to-watch/:context handler
// (server/routes/what-to-watch.js) against an in-memory database, not a copy.
describe('GET /api/what-to-watch/:context', () => {
  let app, db, ids;

  before(() => {
    db = createTestDb();
    ids = seedTestData(db);
    app = createTestApp(db);
  });

  it('returns items from the family list', async () => {
    const res = await request(app).get('/api/what-to-watch/family');
    assert.equal(res.status, 200);
    const titles = res.body.map((i) => i.title);
    assert.ok(titles.includes('The Princess Bride'));
    assert.ok(titles.includes('Spirited Away'));
  });

  it('orders by priority, then added_at', async () => {
    const res = await request(app).get('/api/what-to-watch/family');
    assert.equal(res.body[0].title, 'The Princess Bride'); // priority 1
    assert.equal(res.body[1].title, 'Spirited Away'); // priority 2
  });

  it('returns 400 for an unknown context', async () => {
    const res = await request(app).get('/api/what-to-watch/nonsense');
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'Unknown context');
  });

  it('excludes titles watched in last 12 months for family context', async () => {
    const recent = new Date();
    recent.setMonth(recent.getMonth() - 1);
    db.prepare('INSERT INTO viewings (title_id, date) VALUES (?, ?)').run(
      ids.titles.princessBride,
      recent.toISOString().split('T')[0]
    );

    const res = await request(app).get('/api/what-to-watch/family');
    const titles = res.body.map((i) => i.title);
    assert.ok(!titles.includes('The Princess Bride'), 'Recently watched title should be excluded');
    assert.ok(titles.includes('Spirited Away'), 'Unwatched title should remain');
  });

  it('does NOT exclude recently watched for non-family contexts', async () => {
    const res = await request(app).get('/api/what-to-watch/solo');
    assert.equal(res.status, 200);
    assert.ok(res.body.length >= 1);
  });

  it('includes shortlist data per context', async () => {
    db.prepare(
      "INSERT OR IGNORE INTO shortlists (title_id, person, context) VALUES (?, 'Gordon', 'family')"
    ).run(ids.titles.spiritedAway);

    const res = await request(app).get('/api/what-to-watch/family');
    const spirited = res.body.find((i) => i.title === 'Spirited Away');
    assert.ok(spirited);
    assert.ok(JSON.parse(spirited.shortlisted_by).includes('Gordon'));
  });

  it('returns items from multiple lists for a multi-list context', async () => {
    db.prepare(
      'INSERT OR IGNORE INTO list_items (list_id, title_id, priority) VALUES (?, ?, 1)'
    ).run(ids.lists.nupur, ids.titles.asterix);
    const adult = db
      .prepare(
        "INSERT OR IGNORE INTO lists (name, display_name) VALUES ('adult_movies', 'Adult Movies')"
      )
      .run();
    const adultId =
      adult.lastInsertRowid ||
      db.prepare("SELECT id FROM lists WHERE name = 'adult_movies'").get().id;
    db.prepare(
      'INSERT OR IGNORE INTO list_items (list_id, title_id, priority) VALUES (?, ?, 1)'
    ).run(adultId, ids.titles.breakingBad);

    const res = await request(app).get('/api/what-to-watch/nupur');
    const titles = res.body.map((i) => i.title);
    assert.ok(titles.includes('Asterix: The Secret of the Magic Potion'));
    assert.ok(titles.includes('Breaking Bad'));
  });
});
