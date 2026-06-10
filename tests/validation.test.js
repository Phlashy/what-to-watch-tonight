const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createTestDb, seedTestData, createTestApp } = require('./helpers');

// Integration tests for input validation (server/lib/validate.js), exercised
// through the real routes + middleware mounted by createTestApp.
describe('Input validation', () => {
  let app, db, ids;

  before(() => {
    db = createTestDb();
    ids = seedTestData(db);
    app = createTestApp(db);
  });

  it('rejects an over-long list name (400 with a helpful message)', async () => {
    const res = await request(app)
      .post('/api/lists')
      .send({ name: 'x', display_name: 'a'.repeat(81), description: '' });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /too long/i);
  });

  it('rejects an over-long title (400)', async () => {
    const res = await request(app)
      .post('/api/titles')
      .send({ title: 'a'.repeat(301) });
    assert.equal(res.status, 400);
  });

  it('rejects over-long viewing notes (400)', async () => {
    const res = await request(app)
      .post('/api/viewings')
      .send({ title_id: ids.titles.princessBride, notes: 'a'.repeat(5001), people: [] });
    assert.equal(res.status, 400);
  });

  it('accepts values within the limits', async () => {
    const res = await request(app)
      .post('/api/lists')
      .send({ name: 'ok', display_name: 'Reasonable Name', description: 'fine' });
    assert.equal(res.status, 200);
  });

  it('blanket guard rejects any absurdly large string field (400)', async () => {
    const res = await request(app)
      .post('/api/titles')
      .send({ title: 'Fine', synopsis: 'a'.repeat(10001) });
    assert.equal(res.status, 400);
  });
});
