const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createTestDb, seedTestData, createTestApp } = require('./helpers');

// Integration tests — exercise the REAL viewings routes (server/routes/viewings.js):
// create/update/delete plus the GET filtering & sorting.
describe('Viewings API', () => {
  let app, db, ids;

  before(() => {
    db = createTestDb();
    ids = seedTestData(db);
    app = createTestApp(db);
  });

  describe('POST /api/viewings', () => {
    it('creates a viewing with people and per-person ratings', async () => {
      const res = await request(app)
        .post('/api/viewings')
        .send({
          title_id: ids.titles.princessBride,
          date: '2025-03-15',
          notes: 'Great movie!',
          tags: ['family_movie_night'],
          people: [
            { person: 'Gordon', role: 'chooser', rating: 9 },
            { person: 'Davin', role: 'viewer', rating: 7 },
          ],
        });
      assert.equal(res.status, 200);
      assert.equal(res.body.title, 'The Princess Bride');
      const vp = db.prepare('SELECT * FROM viewing_people WHERE viewing_id = ?').all(res.body.id);
      assert.equal(vp.length, 2);
      assert.equal(vp.find((p) => p.person === 'Gordon').rating, 9);
    });

    it('requires title_id (400)', async () => {
      const res = await request(app).post('/api/viewings').send({ date: '2025-01-01' });
      assert.equal(res.status, 400);
    });

    it('allows a null date and defaults date_precision to day', async () => {
      const res = await request(app)
        .post('/api/viewings')
        .send({ title_id: ids.titles.spiritedAway, people: [] });
      assert.equal(res.status, 200);
      const v = db.prepare('SELECT * FROM viewings WHERE id = ?').get(res.body.id);
      assert.equal(v.date, null);
      assert.equal(v.date_precision, 'day');
    });
  });

  describe('GET /api/viewings — filtering & sorting', () => {
    before(async () => {
      await request(app)
        .post('/api/viewings')
        .send({
          title_id: ids.titles.princessBride,
          date: '2025-01-10',
          notes: 'Loved it',
          tags: ['family_movie_night'],
          people: [
            { person: 'Gordon', role: 'chooser', rating: 9 },
            { person: 'Davin', role: 'viewer', rating: 7 },
          ],
        });
      await request(app)
        .post('/api/viewings')
        .send({
          title_id: ids.titles.breakingBad,
          date: '2025-03-01',
          tags: [],
          people: [{ person: 'Gordon', role: 'chooser', rating: 6 }],
        });
    });

    it('filters by person', async () => {
      const res = await request(app).get('/api/viewings?person=Davin');
      assert.ok(res.body.viewings.length >= 1);
      assert.ok(
        res.body.viewings.every((v) => JSON.parse(v.people).some((p) => p.person === 'Davin'))
      );
    });

    it('filters by date range', async () => {
      const res = await request(app).get('/api/viewings?from=2025-02-01&to=2025-04-01');
      assert.ok(res.body.viewings.every((v) => v.date >= '2025-02-01' && v.date <= '2025-04-01'));
    });

    it('filters by tag', async () => {
      const res = await request(app).get('/api/viewings?tags=family_movie_night');
      assert.ok(res.body.viewings.length >= 1);
      assert.ok(res.body.viewings.every((v) => v.tags.includes('family_movie_night')));
    });

    it('filters by hasNotes', async () => {
      const res = await request(app).get('/api/viewings?hasNotes=true');
      assert.ok(res.body.viewings.every((v) => v.notes && v.notes.length > 0));
    });

    it('filters by type=movie / type=show', async () => {
      const movies = await request(app).get('/api/viewings?type=movie');
      assert.ok(movies.body.viewings.every((v) => v.type === 'movie'));
      const shows = await request(app).get('/api/viewings?type=show');
      assert.ok(shows.body.viewings.every((v) => v.type === 'show'));
      assert.ok(shows.body.viewings.some((v) => v.title === 'Breaking Bad'));
    });

    it('filters by minRating (uses best per-person rating)', async () => {
      const res = await request(app).get('/api/viewings?minRating=8');
      assert.ok(res.body.viewings.length >= 1);
      assert.ok(res.body.viewings.some((v) => v.title === 'The Princess Bride'));
      assert.ok(!res.body.viewings.some((v) => v.title === 'Breaking Bad')); // best rating 6
    });

    it('supports sort=rating', async () => {
      const res = await request(app).get('/api/viewings?sort=rating');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.viewings));
    });
  });

  describe('PUT /api/viewings/:id', () => {
    it('updates notes, preserves unset fields, and replaces people', async () => {
      const created = await request(app)
        .post('/api/viewings')
        .send({
          title_id: ids.titles.spiritedAway,
          date: '2025-01-01',
          rating: 7,
          notes: 'Original',
          people: [{ person: 'Gordon', role: 'chooser' }],
        });
      const id = created.body.id;
      const res = await request(app)
        .put(`/api/viewings/${id}`)
        .send({
          notes: 'Updated',
          people: [
            { person: 'Nupur', role: 'chooser' },
            { person: 'Gordon', role: 'viewer' },
          ],
        });
      assert.equal(res.status, 200);
      const v = db.prepare('SELECT * FROM viewings WHERE id = ?').get(id);
      assert.equal(v.notes, 'Updated');
      assert.equal(v.date, '2025-01-01'); // preserved
      assert.equal(v.rating, 7); // preserved
      const people = db.prepare('SELECT * FROM viewing_people WHERE viewing_id = ?').all(id);
      assert.equal(people.length, 2);
      assert.ok(people.some((p) => p.person === 'Nupur' && p.role === 'chooser'));
    });
  });

  describe('DELETE /api/viewings/:id', () => {
    it('deletes a viewing and its people', async () => {
      const created = await request(app)
        .post('/api/viewings')
        .send({
          title_id: ids.titles.breakingBad,
          date: '2025-01-01',
          people: [{ person: 'Gordon', role: 'chooser' }],
        });
      const id = created.body.id;
      const res = await request(app).delete(`/api/viewings/${id}`);
      assert.equal(res.status, 200);
      assert.equal(db.prepare('SELECT * FROM viewings WHERE id = ?').get(id), undefined);
      assert.equal(
        db.prepare('SELECT * FROM viewing_people WHERE viewing_id = ?').all(id).length,
        0
      );
    });
  });

  describe('robustness', () => {
    it('404s when updating or deleting a viewing that does not exist', async () => {
      const put = await request(app).put('/api/viewings/999999').send({ notes: 'nope' });
      assert.equal(put.status, 404);
      const del = await request(app).delete('/api/viewings/999999');
      assert.equal(del.status, 404);
    });

    it('clamps an oversized limit to 200', async () => {
      const res = await request(app).get('/api/viewings?limit=99999');
      assert.equal(res.status, 200);
      assert.equal(res.body.limit, 200);
    });

    it('tag filtering matches whole tags, not substrings', async () => {
      await request(app)
        .post('/api/viewings')
        .send({ title_id: ids.titles.princessBride, date: '2025-07-01', tags: ['comedy'] });
      await request(app)
        .post('/api/viewings')
        .send({ title_id: ids.titles.spiritedAway, date: '2025-07-02', tags: ['dark_comedy'] });

      const res = await request(app).get('/api/viewings?tags=comedy');
      const tagSets = res.body.viewings.map((v) => v.tags);
      assert.ok(tagSets.some((t) => t.includes('"comedy"')));
      // "comedy" must NOT match the viewing tagged dark_comedy
      assert.ok(!tagSets.some((t) => t.includes('dark_comedy')));
      assert.equal(res.body.total, 1);
    });
  });

  describe('atomicity', () => {
    it('rolls back the whole viewing if a people insert fails mid-way', async () => {
      // person is NOT NULL, so the second insert throws after the viewing row
      // and the first person have already been written — the transaction must
      // undo both, leaving no half-logged viewing.
      const countBefore = db.prepare('SELECT COUNT(*) c FROM viewings').get().c;
      const peopleBefore = db.prepare('SELECT COUNT(*) c FROM viewing_people').get().c;

      const res = await request(app)
        .post('/api/viewings')
        .send({
          title_id: ids.titles.spiritedAway,
          date: '2025-06-01',
          people: [{ person: 'Gordon', rating: 8 }, { person: null }],
        });

      assert.equal(res.status, 500);
      assert.equal(db.prepare('SELECT COUNT(*) c FROM viewings').get().c, countBefore);
      assert.equal(db.prepare('SELECT COUNT(*) c FROM viewing_people').get().c, peopleBefore);
    });

    it('keeps existing people if a PUT people replacement fails mid-way', async () => {
      const created = await request(app)
        .post('/api/viewings')
        .send({
          title_id: ids.titles.breakingBad,
          date: '2025-06-02',
          people: [
            { person: 'Gordon', rating: 7 },
            { person: 'Nupur', rating: 8 },
          ],
        });
      const id = created.body.id;

      // The replacement deletes the old people first, then the bad row throws —
      // without the transaction this would wipe Gordon and Nupur.
      const res = await request(app)
        .put(`/api/viewings/${id}`)
        .send({ people: [{ person: null }] });

      assert.equal(res.status, 500);
      const people = db
        .prepare('SELECT person FROM viewing_people WHERE viewing_id = ? ORDER BY person')
        .all(id);
      assert.deepEqual(
        people.map((p) => p.person),
        ['Gordon', 'Nupur']
      );
    });
  });
});
