const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createTestDb, seedTestData, createTestApp } = require('./helpers');

// Integration tests — exercise the REAL lists routes (server/routes/lists.js).
describe('Lists API', () => {
  let app, db, ids;

  before(() => {
    db = createTestDb();
    ids = seedTestData(db);
    app = createTestApp(db);
  });

  describe('GET /api/lists', () => {
    it('returns all lists with item counts', async () => {
      const res = await request(app).get('/api/lists');
      assert.equal(res.status, 200);
      const family = res.body.find((l) => l.name === 'family_to_watch');
      assert.equal(family.item_count, 2); // Princess Bride + Spirited Away
      // last_added drives the "Recently updated" sort on the Lists overview
      assert.ok('last_added' in family);
    });
  });

  describe('GET /api/lists/:name/items', () => {
    it('returns items with metadata, ordered by priority', async () => {
      const res = await request(app).get('/api/lists/family_to_watch/items');
      assert.equal(res.status, 200);
      assert.equal(res.body.items.length, 2);
      assert.equal(res.body.items[0].title, 'The Princess Bride');
      assert.equal(res.body.items[1].title, 'Spirited Away');
    });

    it('404 for an unknown list', async () => {
      const res = await request(app).get('/api/lists/nope/items');
      assert.equal(res.status, 404);
    });
  });

  describe('POST /api/lists/:name/items', () => {
    it('adds a title to a list', async () => {
      const res = await request(app).post('/api/lists/with_nupur/items').send({
        title_id: ids.titles.breakingBad,
        streaming_service: 'Netflix',
        note: 'rec',
        added_by: 'Gordon',
      });
      assert.equal(res.status, 200);
      const item = db.prepare('SELECT * FROM list_items WHERE id = ?').get(res.body.id);
      assert.equal(item.streaming_service, 'Netflix');
      assert.equal(item.added_by, 'Gordon');
    });

    it('rejects a duplicate title on the same list (409)', async () => {
      const res = await request(app)
        .post('/api/lists/family_to_watch/items')
        .send({ title_id: ids.titles.princessBride });
      assert.equal(res.status, 409);
    });

    it('requires title_id (400)', async () => {
      const res = await request(app).post('/api/lists/with_nupur/items').send({});
      assert.equal(res.status, 400);
    });

    it('allows the same title on a different list', async () => {
      const res = await request(app)
        .post('/api/lists/with_nupur/items')
        .send({ title_id: ids.titles.princessBride });
      assert.equal(res.status, 200);
    });
  });

  describe('POST /api/lists (create)', () => {
    it('creates a list and sanitizes the name', async () => {
      const res = await request(app).post('/api/lists').send({
        name: 'Date Night!',
        display_name: 'Date Night',
        description: 'Films for date nights',
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.name, 'date_night_'); // lowercased; space and '!' → '_'
      assert.equal(res.body.display_name, 'Date Night');
    });

    it('requires name and display_name (400)', async () => {
      const res = await request(app).post('/api/lists').send({ name: 'x' });
      assert.equal(res.status, 400);
    });

    it('rejects a duplicate list name (409)', async () => {
      await request(app).post('/api/lists').send({ name: 'unique_test', display_name: 'Unique' });
      const res = await request(app)
        .post('/api/lists')
        .send({ name: 'unique_test', display_name: 'Other' });
      assert.equal(res.status, 409);
    });

    it('a new empty list shows item_count 0 in GET /api/lists', async () => {
      await request(app).post('/api/lists').send({ name: 'empty_list', display_name: 'Empty' });
      const res = await request(app).get('/api/lists');
      const empty = res.body.find((l) => l.name === 'empty_list');
      assert.ok(empty);
      assert.equal(empty.item_count, 0);
    });
  });

  describe('reorder + remove', () => {
    it('bulk reorder updates priorities transactionally', async () => {
      const res = await request(app)
        .post('/api/lists/items/reorder')
        .send({ order: [ids.listItems.spiritedAwayFamily, ids.listItems.princessBrideFamily] });
      assert.equal(res.status, 200);
      const items = db
        .prepare('SELECT * FROM list_items WHERE list_id = ? ORDER BY priority ASC')
        .all(ids.lists.family);
      assert.equal(items[0].title_id, ids.titles.spiritedAway); // now priority 1
    });

    it('reorder requires an order array (400)', async () => {
      const res = await request(app).post('/api/lists/items/reorder').send({});
      assert.equal(res.status, 400);
    });

    it('removes an item from a list', async () => {
      const add = await request(app)
        .post('/api/lists/solo_gordon/items')
        .send({ title_id: ids.titles.spiritedAway });
      const del = await request(app).delete(`/api/lists/solo_gordon/items/${add.body.id}`);
      assert.equal(del.status, 200);
      assert.equal(db.prepare('SELECT * FROM list_items WHERE id = ?').get(add.body.id), undefined);
    });

    it('404s when updating or removing a list item that does not exist', async () => {
      const put = await request(app)
        .put('/api/lists/solo_gordon/items/999999')
        .send({ note: 'nope' });
      assert.equal(put.status, 404);
      const del = await request(app).delete('/api/lists/solo_gordon/items/999999');
      assert.equal(del.status, 404);
    });
  });

  describe('PUT /api/lists/:name (rename / icon)', () => {
    it('updates display name, description, and icon', async () => {
      const res = await request(app)
        .put('/api/lists/with_nupur')
        .send({ display_name: 'Nupur & Me', description: 'date nights', icon: '💑' });
      assert.equal(res.status, 200);
      assert.equal(res.body.display_name, 'Nupur & Me');
      assert.equal(res.body.icon, '💑');
      // internal name is unchanged (other things reference it)
      assert.equal(res.body.name, 'with_nupur');
    });

    it('404 for an unknown list', async () => {
      const res = await request(app).put('/api/lists/nope').send({ display_name: 'x' });
      assert.equal(res.status, 404);
    });

    it('rejects an over-long display name (400)', async () => {
      const res = await request(app)
        .put('/api/lists/solo_gordon')
        .send({ display_name: 'a'.repeat(81) });
      assert.equal(res.status, 400);
    });
  });

  describe('DELETE /api/lists/:name', () => {
    it('deletes the list and its memberships, but not the titles', async () => {
      // family_to_watch has 2 items (princessBride, spiritedAway)
      const del = await request(app).delete('/api/lists/family_to_watch');
      assert.equal(del.status, 200);
      assert.equal(
        db.prepare("SELECT * FROM lists WHERE name = 'family_to_watch'").get(),
        undefined
      );
      assert.equal(
        db.prepare('SELECT COUNT(*) n FROM list_items WHERE list_id = ?').get(ids.lists.family).n,
        0
      );
      // titles survive
      assert.ok(db.prepare('SELECT 1 FROM titles WHERE id = ?').get(ids.titles.princessBride));
    });

    it('404 for an unknown list', async () => {
      const res = await request(app).delete('/api/lists/nope');
      assert.equal(res.status, 404);
    });
  });
});
