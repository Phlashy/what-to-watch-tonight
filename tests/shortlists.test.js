const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createTestDb, seedTestData, createTestApp } = require('./helpers');

// Integration tests — exercise the REAL shortlists routes (server/routes/shortlists.js).
describe('Shortlists API', () => {
  let app, db, ids;

  before(() => {
    db = createTestDb();
    ids = seedTestData(db);
    app = createTestApp(db);
  });

  describe('POST /api/shortlists (toggle)', () => {
    it('adds when not present', async () => {
      const res = await request(app)
        .post('/api/shortlists')
        .send({ title_id: ids.titles.princessBride, person: 'Gordon', context: 'family' });
      assert.equal(res.status, 200);
      assert.equal(res.body.action, 'added');
    });

    it('removes when present (toggle off)', async () => {
      const res = await request(app)
        .post('/api/shortlists')
        .send({ title_id: ids.titles.princessBride, person: 'Gordon', context: 'family' });
      assert.equal(res.body.action, 'removed');
    });

    it('requires title_id, person, context (400)', async () => {
      const res = await request(app).post('/api/shortlists').send({ person: 'Gordon' });
      assert.equal(res.status, 400);
    });

    it('treats different contexts as independent for the same person+title', async () => {
      await request(app)
        .post('/api/shortlists')
        .send({ title_id: ids.titles.spiritedAway, person: 'Gordon', context: 'family' });
      await request(app)
        .post('/api/shortlists')
        .send({ title_id: ids.titles.spiritedAway, person: 'Gordon', context: 'solo' });
      const rows = db
        .prepare('SELECT * FROM shortlists WHERE title_id = ? AND person = ?')
        .all(ids.titles.spiritedAway, 'Gordon');
      assert.equal(rows.length, 2);
    });
  });

  describe('GET /api/shortlists?context=', () => {
    it('400 without a context', async () => {
      const res = await request(app).get('/api/shortlists');
      assert.equal(res.status, 400);
    });

    it('groups people by title for a context', async () => {
      await request(app)
        .post('/api/shortlists')
        .send({ title_id: ids.titles.breakingBad, person: 'Nupur', context: 'nupur' });
      await request(app)
        .post('/api/shortlists')
        .send({ title_id: ids.titles.breakingBad, person: 'Gordon', context: 'nupur' });
      const res = await request(app).get('/api/shortlists?context=nupur');
      const bb = res.body.find((g) => g.title_id === ids.titles.breakingBad);
      assert.ok(bb.people.includes('Nupur') && bb.people.includes('Gordon'));
    });
  });

  describe('context-mismatch limitation (documented behavior)', () => {
    it('a star created under one context is not cleared by toggling a different context', async () => {
      await request(app)
        .post('/api/shortlists')
        .send({ title_id: ids.titles.asterix, person: 'Davin', context: 'family' });
      // Toggling under a different context adds a separate row rather than clearing the first.
      const res = await request(app)
        .post('/api/shortlists')
        .send({ title_id: ids.titles.asterix, person: 'Davin', context: 'solo' });
      assert.equal(res.body.action, 'added');
      const familyRow = db
        .prepare(
          "SELECT * FROM shortlists WHERE title_id = ? AND person = 'Davin' AND context = 'family'"
        )
        .get(ids.titles.asterix);
      assert.ok(familyRow, 'family star remains — toggling needs the matching context');
    });
  });
});
