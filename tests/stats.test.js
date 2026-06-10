const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createTestDb, seedTestData, createTestApp } = require('./helpers');

// Integration tests — exercise the REAL GET /api/stats handler (server/routes/stats.js).
describe('GET /api/stats', () => {
  let app, db, ids;

  before(() => {
    db = createTestDb();
    ids = seedTestData(db);
    app = createTestApp(db);
  });

  it('returns totals for the seeded data', async () => {
    // Seed: 4 titles, 3 list_items, 0 viewings.
    const res = await request(app).get('/api/stats');
    assert.equal(res.status, 200);
    assert.equal(res.body.totalTitles, 4);
    assert.equal(res.body.totalToWatch, 3);
    assert.equal(res.body.totalWatched, 0);
    assert.ok(Array.isArray(res.body.recentWatched));
  });

  it('reflects a newly logged viewing in totals and recent list', async () => {
    db.prepare("INSERT INTO viewings (title_id, date) VALUES (?, '2025-05-01')").run(
      ids.titles.princessBride
    );
    const res = await request(app).get('/api/stats');
    assert.equal(res.body.totalWatched, 1);
    assert.equal(res.body.recentWatched[0].title, 'The Princess Bride');
  });
});
