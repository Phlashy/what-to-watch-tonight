const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createTestDb, seedTestData, createTestApp } = require('./helpers');

// Integration test — exercises the REAL POST /api/viewings handler and its side
// effects (remove-from-family-list, rotation advance, picked_by scope).
describe('POST /api/viewings — side effects', () => {
  let app, db, ids;

  before(() => {
    db = createTestDb();
    ids = seedTestData(db);
    app = createTestApp(db);
  });

  beforeEach(() => {
    db.prepare('DELETE FROM viewing_people').run();
    db.prepare('DELETE FROM viewings').run();
    db.prepare('DELETE FROM settings').run();
    // Restore family list memberships so each test is independent of order.
    db.prepare(
      'INSERT OR IGNORE INTO list_items (list_id, title_id, priority) VALUES (?, ?, 1)'
    ).run(ids.lists.family, ids.titles.princessBride);
    db.prepare(
      'INSERT OR IGNORE INTO list_items (list_id, title_id, priority) VALUES (?, ?, 2)'
    ).run(ids.lists.family, ids.titles.spiritedAway);
  });

  const onFamilyList = (titleId) =>
    db
      .prepare(
        "SELECT 1 FROM list_items li JOIN lists l ON li.list_id = l.id WHERE l.name = 'family_to_watch' AND li.title_id = ?"
      )
      .get(titleId);

  it('removes the title from family_to_watch when tagged family_movie_night', async () => {
    assert.ok(onFamilyList(ids.titles.princessBride), 'on family list before');
    const res = await request(app)
      .post('/api/viewings')
      .send({
        title_id: ids.titles.princessBride,
        date: '2025-03-28',
        tags: ['family_movie_night'],
        people: [{ person: 'Davin', role: 'chooser' }],
      });
    assert.equal(res.status, 200);
    assert.equal(onFamilyList(ids.titles.princessBride), undefined, 'removed after watching');
  });

  it('does NOT remove from family_to_watch without the tag', async () => {
    await request(app)
      .post('/api/viewings')
      .send({
        title_id: ids.titles.spiritedAway,
        date: '2025-03-28',
        tags: [],
        people: [{ person: 'Gordon' }],
      });
    assert.ok(onFamilyList(ids.titles.spiritedAway), 'stays on family list');
  });

  it('advances rotation when a family_movie_night viewing is logged', async () => {
    db.prepare("INSERT INTO settings (key, value) VALUES ('family_rotation_next', 'Davin')").run();
    await request(app)
      .post('/api/viewings')
      .send({
        title_id: ids.titles.princessBride,
        date: '2025-03-28',
        tags: ['family_movie_night'],
        people: [{ person: 'Arianne' }],
      });
    const next = db.prepare("SELECT value FROM settings WHERE key = 'family_rotation_next'").get();
    assert.equal(next?.value, 'Arianne', 'advanced Davin → Arianne');
  });

  it('does NOT advance rotation for non-family viewings', async () => {
    db.prepare("INSERT INTO settings (key, value) VALUES ('family_rotation_next', 'Davin')").run();
    await request(app)
      .post('/api/viewings')
      .send({
        title_id: ids.titles.breakingBad,
        date: '2025-03-28',
        tags: [],
        people: [{ person: 'Gordon' }],
      });
    const next = db.prepare("SELECT value FROM settings WHERE key = 'family_rotation_next'").get();
    assert.equal(next?.value, 'Davin', 'unchanged');
  });

  it('requires title_id (400)', async () => {
    const res = await request(app).post('/api/viewings').send({ date: '2025-03-28' });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'title_id required');
  });

  describe('picked_by scope', () => {
    it('picked_by updates only the family_to_watch list item, not other lists', async () => {
      db.prepare(
        "INSERT OR IGNORE INTO list_items (list_id, title_id, added_by) VALUES (?, ?, 'Nupur')"
      ).run(ids.lists.nupur, ids.titles.spiritedAway);

      await request(app)
        .post('/api/viewings')
        .send({
          title_id: ids.titles.spiritedAway,
          date: '2025-03-28',
          tags: [],
          people: [{ person: 'Gordon' }],
          picked_by: 'Gordon',
        });

      const familyItem = db
        .prepare(
          "SELECT li.added_by FROM list_items li JOIN lists l ON li.list_id = l.id WHERE l.name = 'family_to_watch' AND li.title_id = ?"
        )
        .get(ids.titles.spiritedAway);
      const nupurItem = db
        .prepare(
          "SELECT li.added_by FROM list_items li JOIN lists l ON li.list_id = l.id WHERE l.name = 'with_nupur' AND li.title_id = ?"
        )
        .get(ids.titles.spiritedAway);

      assert.equal(familyItem.added_by, 'Gordon', 'family list item updated');
      assert.equal(nupurItem.added_by, 'Nupur', 'nupur list item untouched');
    });
  });
});
