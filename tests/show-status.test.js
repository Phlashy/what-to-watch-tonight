const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createTestDb, seedTestData, createTestApp } = require('./helpers');

// Integration tests — exercise the REAL show-status routes (server/routes/show-status.js),
// including the gated auto-remove-from-lists behavior.
describe('Show Status API', () => {
  let app, db, ids;

  before(() => {
    db = createTestDb();
    ids = seedTestData(db);
    app = createTestApp(db);
  });

  beforeEach(() => {
    db.prepare('DELETE FROM show_status').run();
    // Breaking Bad (a show) stays on the solo list as a fixture for auto-remove tests.
    db.prepare(
      "INSERT OR IGNORE INTO list_items (list_id, title_id, priority, added_by) VALUES (?, ?, 1, 'Gordon')"
    ).run(ids.lists.solo, ids.titles.breakingBad);
  });

  const onAnyList = (titleId) =>
    !!db.prepare('SELECT 1 FROM list_items WHERE title_id = ?').get(titleId);

  describe('POST /api/show-status', () => {
    it('sets and returns the statuses for the title', async () => {
      const res = await request(app)
        .post('/api/show-status')
        .send({ title_id: ids.titles.breakingBad, person: 'Gordon', status: 'wishlist' });
      assert.equal(res.status, 200);
      assert.ok(res.body.some((s) => s.person === 'Gordon' && s.status === 'wishlist'));
    });

    it('rejects an invalid status (400)', async () => {
      const res = await request(app)
        .post('/api/show-status')
        .send({ title_id: ids.titles.breakingBad, person: 'Gordon', status: 'bogus' });
      assert.equal(res.status, 400);
    });

    it('requires title_id, person, status (400)', async () => {
      const res = await request(app).post('/api/show-status').send({ person: 'Gordon' });
      assert.equal(res.status, 400);
    });

    it('upserts — one row per person', async () => {
      await request(app)
        .post('/api/show-status')
        .send({ title_id: ids.titles.breakingBad, person: 'Gordon', status: 'wishlist' });
      await request(app)
        .post('/api/show-status')
        .send({ title_id: ids.titles.breakingBad, person: 'Gordon', status: 'watching' });
      const rows = db
        .prepare('SELECT * FROM show_status WHERE title_id = ? AND person = ?')
        .all(ids.titles.breakingBad, 'Gordon');
      assert.equal(rows.length, 1);
      assert.equal(rows[0].status, 'watching');
    });
  });

  describe('auto-remove from lists (gated by remaining engagement)', () => {
    it('removes from lists when the sole engaged person finishes', async () => {
      assert.ok(onAnyList(ids.titles.breakingBad));
      await request(app)
        .post('/api/show-status')
        .send({ title_id: ids.titles.breakingBad, person: 'Gordon', status: 'finished' });
      assert.equal(onAnyList(ids.titles.breakingBad), false);
    });

    it('does NOT remove while another person is still watching', async () => {
      await request(app)
        .post('/api/show-status')
        .send({ title_id: ids.titles.breakingBad, person: 'Davin', status: 'watching' });
      await request(app)
        .post('/api/show-status')
        .send({ title_id: ids.titles.breakingBad, person: 'Gordon', status: 'finished' });
      assert.ok(onAnyList(ids.titles.breakingBad), 'stays — Davin still watching');
    });

    it('removes once the last engaged person finishes', async () => {
      await request(app)
        .post('/api/show-status')
        .send({ title_id: ids.titles.breakingBad, person: 'Davin', status: 'watching' });
      await request(app)
        .post('/api/show-status')
        .send({ title_id: ids.titles.breakingBad, person: 'Gordon', status: 'finished' });
      await request(app)
        .post('/api/show-status')
        .send({ title_id: ids.titles.breakingBad, person: 'Davin', status: 'finished' });
      assert.equal(onAnyList(ids.titles.breakingBad), false);
    });
  });

  describe('GET / DELETE', () => {
    it('GET requires title_id (400)', async () => {
      const res = await request(app).get('/api/show-status');
      assert.equal(res.status, 400);
    });

    it('GET returns statuses for a title', async () => {
      await request(app)
        .post('/api/show-status')
        .send({ title_id: ids.titles.breakingBad, person: 'Nupur', status: 'wishlist' });
      const res = await request(app).get(`/api/show-status?title_id=${ids.titles.breakingBad}`);
      assert.ok(res.body.some((s) => s.person === 'Nupur'));
    });

    it('DELETE clears a person status; 400 if missing fields', async () => {
      await request(app)
        .post('/api/show-status')
        .send({ title_id: ids.titles.breakingBad, person: 'Nupur', status: 'wishlist' });
      const del = await request(app)
        .delete('/api/show-status')
        .send({ title_id: ids.titles.breakingBad, person: 'Nupur' });
      assert.equal(del.status, 200);
      assert.ok(!del.body.some((s) => s.person === 'Nupur'));
      const bad = await request(app)
        .delete('/api/show-status')
        .send({ title_id: ids.titles.breakingBad });
      assert.equal(bad.status, 400);
    });
  });

  describe('GET /api/show-status/log', () => {
    it('returns shows with viewings, grouped, excluding movies', async () => {
      db.prepare("INSERT INTO viewings (title_id, date, tags) VALUES (?, '2025-03-01', '[]')").run(
        ids.titles.breakingBad
      );
      db.prepare("INSERT INTO viewings (title_id, date, tags) VALUES (?, '2025-03-02', '[]')").run(
        ids.titles.princessBride
      ); // movie — excluded
      const res = await request(app).get('/api/show-status/log');
      assert.equal(res.status, 200);
      assert.ok(res.body.shows.some((s) => s.title === 'Breaking Bad'));
      assert.ok(!res.body.shows.some((s) => s.title === 'The Princess Bride'));
      assert.equal(typeof res.body.total, 'number');
    });
  });
});
