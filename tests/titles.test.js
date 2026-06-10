const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createTestDb, seedTestData, createTestApp } = require('./helpers');

// Integration tests — exercise the REAL titles routes (server/routes/titles.js).
describe('Titles API', () => {
  let app, db, ids;

  before(() => {
    db = createTestDb();
    ids = seedTestData(db);
    app = createTestApp(db);
  });

  describe('POST /api/titles', () => {
    it('creates a title; cast/genre are stored as JSON strings', async () => {
      const res = await request(app)
        .post('/api/titles')
        .send({
          title: 'Dune',
          type: 'movie',
          year: 2021,
          director: 'Denis Villeneuve',
          cast: ['Timothée Chalamet'],
          genre: ['Science Fiction'],
          runtime_minutes: 155,
        });
      assert.equal(res.status, 200);
      assert.equal(res.body.title, 'Dune');
      assert.equal(JSON.parse(res.body.genre)[0], 'Science Fiction');
      assert.equal(JSON.parse(res.body.cast)[0], 'Timothée Chalamet');
    });

    it('requires a title (400)', async () => {
      const res = await request(app).post('/api/titles').send({ year: 2000 });
      assert.equal(res.status, 400);
    });

    it('defaults type to movie', async () => {
      const res = await request(app).post('/api/titles').send({ title: 'Untyped' });
      assert.equal(res.body.type, 'movie');
    });
  });

  describe('GET /api/titles', () => {
    it('searches by title and returns a total', async () => {
      const res = await request(app).get('/api/titles?q=Princess');
      assert.equal(res.status, 200);
      assert.ok(res.body.titles.some((t) => t.title === 'The Princess Bride'));
      assert.equal(typeof res.body.total, 'number');
    });

    it('searches by director', async () => {
      const res = await request(app).get('/api/titles?q=Miyazaki');
      assert.ok(res.body.titles.some((t) => t.title === 'Spirited Away'));
    });

    it('filters by type', async () => {
      const res = await request(app).get('/api/titles?type=show');
      assert.ok(res.body.titles.length > 0);
      assert.ok(res.body.titles.every((t) => t.type === 'show'));
      assert.ok(res.body.titles.some((t) => t.title === 'Breaking Bad'));
    });
  });

  describe('GET /api/titles/:id', () => {
    it('returns the title with viewings, listMemberships, collection, shortlists', async () => {
      const res = await request(app).get(`/api/titles/${ids.titles.princessBride}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.title, 'The Princess Bride');
      assert.ok(Array.isArray(res.body.viewings));
      assert.ok(Array.isArray(res.body.listMemberships));
      assert.ok(Array.isArray(res.body.collection));
      assert.ok(Array.isArray(res.body.shortlists));
    });

    it('404 for a missing title', async () => {
      const res = await request(app).get('/api/titles/999999');
      assert.equal(res.status, 404);
    });
  });

  describe('PUT /api/titles/:id', () => {
    it('updates provided fields and preserves the rest (COALESCE)', async () => {
      const res = await request(app).put(`/api/titles/${ids.titles.asterix}`).send({ year: 2019 });
      assert.equal(res.status, 200);
      assert.equal(res.body.year, 2019);
      assert.equal(res.body.title, 'Asterix: The Secret of the Magic Potion'); // unchanged
    });

    // Regression: this is exactly what the in-app title rename sends. It used to
    // 500 because the bare reserved word `cast` parsed as the CAST operator (and
    // omitted fields bound as undefined). Both are fixed.
    it('renames a title when only { title } is sent', async () => {
      const res = await request(app)
        .put(`/api/titles/${ids.titles.breakingBad}`)
        .send({ title: 'Breaking Bad (Remastered)' });
      assert.equal(res.status, 200);
      assert.equal(res.body.title, 'Breaking Bad (Remastered)');
      assert.equal(res.body.type, 'show'); // unchanged
    });
  });
});
