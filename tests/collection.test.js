const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createTestDb, seedTestData, createTestApp } = require('./helpers');

// Integration tests — exercise the REAL collection routes (server/routes/collection.js).
describe('Collection API', () => {
  let app, db, ids;

  before(() => {
    db = createTestDb();
    ids = seedTestData(db);
    app = createTestApp(db);
  });

  describe('POST /api/collection', () => {
    it('adds a DVD entry', async () => {
      const res = await request(app)
        .post('/api/collection')
        .send({ title_id: ids.titles.princessBride, format: 'dvd' });
      assert.equal(res.status, 200);
      assert.equal(res.body.format, 'dvd');
    });

    it('adds a digital entry with a platform', async () => {
      const res = await request(app)
        .post('/api/collection')
        .send({ title_id: ids.titles.spiritedAway, format: 'digital', platform: 'Apple' });
      assert.equal(res.status, 200);
      assert.equal(res.body.platform, 'Apple');
    });

    it('rejects an invalid format (400)', async () => {
      const res = await request(app)
        .post('/api/collection')
        .send({ title_id: ids.titles.breakingBad, format: 'vhs' });
      assert.equal(res.status, 400);
    });

    it('requires title_id and format (400)', async () => {
      const res = await request(app).post('/api/collection').send({ format: 'dvd' });
      assert.equal(res.status, 400);
    });

    it('rejects a duplicate format for the same title (409)', async () => {
      await request(app)
        .post('/api/collection')
        .send({ title_id: ids.titles.breakingBad, format: 'bluray' });
      const res = await request(app)
        .post('/api/collection')
        .send({ title_id: ids.titles.breakingBad, format: 'bluray' });
      assert.equal(res.status, 409);
    });

    it('allows different formats for the same title', async () => {
      const res = await request(app)
        .post('/api/collection')
        .send({ title_id: ids.titles.breakingBad, format: 'dvd' });
      assert.equal(res.status, 200);
    });
  });

  describe('GET + DELETE', () => {
    it('lists all entries with joined title info', async () => {
      const res = await request(app).get('/api/collection');
      assert.equal(res.status, 200);
      assert.ok(res.body.length >= 1);
      assert.ok(res.body[0].title, 'entry includes the joined title');
    });

    it('returns entries for a specific title', async () => {
      const res = await request(app).get(`/api/collection/title/${ids.titles.princessBride}`);
      assert.ok(res.body.some((c) => c.format === 'dvd'));
    });

    it('removes an entry', async () => {
      const add = await request(app)
        .post('/api/collection')
        .send({ title_id: ids.titles.asterix, format: 'dvd' });
      const del = await request(app).delete(`/api/collection/${add.body.id}`);
      assert.equal(del.status, 200);
      assert.equal(db.prepare('SELECT * FROM collection WHERE id = ?').get(add.body.id), undefined);
    });
  });
});
