const express = require('express');
const router = express.Router();
const rotationCore = require('../lib/rotation');
const { checkLength, LIMITS } = require('../lib/validate');

// GET /api/viewings
router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const { person, from, to, minRating, maxRating, tags, search, hasNotes, sort, type } = req.query;
  // Clamp pagination — uncapped limits would let one request dump every row.
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const offset = (page - 1) * limit;

  // Build the WHERE clause once — the results query and the count query share
  // it, so a filter can never apply to one and not the other (which would
  // silently break pagination totals).
  let where = ' WHERE 1=1';
  const filterParams = [];

  if (type) {
    where += ' AND t.type = ?';
    filterParams.push(type);
  }
  if (search) {
    where += ' AND t.title LIKE ?';
    filterParams.push(`%${search}%`);
  }
  if (from) {
    where += ' AND v.date >= ?';
    filterParams.push(from);
  }
  if (to) {
    where += ' AND v.date <= ?';
    filterParams.push(to);
  }
  if (minRating) {
    where +=
      ' AND COALESCE((SELECT MAX(vp2.rating) FROM viewing_people vp2 WHERE vp2.viewing_id = v.id AND vp2.rating IS NOT NULL), v.rating) >= ?';
    filterParams.push(parseInt(minRating));
  }
  if (maxRating) {
    where +=
      ' AND COALESCE((SELECT MAX(vp2.rating) FROM viewing_people vp2 WHERE vp2.viewing_id = v.id AND vp2.rating IS NOT NULL), v.rating) <= ?';
    filterParams.push(parseInt(maxRating));
  }
  if (tags) {
    for (const tag of tags.split(',')) {
      // tags is a JSON array of strings, so match the quoted form — a bare
      // %comedy% would also match "dark_comedy".
      where += ' AND v.tags LIKE ?';
      filterParams.push(`%"${tag.trim()}"%`);
    }
  }
  if (person) {
    where +=
      ' AND EXISTS (SELECT 1 FROM viewing_people vp2 WHERE vp2.viewing_id = v.id AND vp2.person = ?)';
    filterParams.push(person);
  }
  if (hasNotes === 'true') {
    where += " AND v.notes IS NOT NULL AND v.notes != ''";
  }

  const orderBy =
    sort === 'rating'
      ? ' GROUP BY v.id ORDER BY COALESCE((SELECT MAX(vp3.rating) FROM viewing_people vp3 WHERE vp3.viewing_id = v.id AND vp3.rating IS NOT NULL), v.rating) DESC NULLS LAST, v.date DESC NULLS LAST'
      : ' GROUP BY v.id ORDER BY v.date DESC NULLS LAST, v.created_at DESC';

  const viewings = db
    .prepare(
      `
    SELECT v.*, t.title, t.year, t.poster_url, t.type, t.genre, t.director,
      json_group_array(json_object('person', vp.person, 'role', vp.role, 'rating', vp.rating)) as people
    FROM viewings v
    JOIN titles t ON v.title_id = t.id
    LEFT JOIN viewing_people vp ON v.id = vp.viewing_id
    ${where}${orderBy} LIMIT ? OFFSET ?
  `
    )
    .all(...filterParams, limit, offset);

  const total = db
    .prepare(
      `
    SELECT COUNT(DISTINCT v.id) as total
    FROM viewings v JOIN titles t ON v.title_id = t.id
    LEFT JOIN viewing_people vp ON v.id = vp.viewing_id
    ${where}
  `
    )
    .get(...filterParams).total;

  res.json({ viewings, total, page, limit });
});

// POST /api/viewings
router.post('/', (req, res) => {
  const db = req.app.locals.db;
  const {
    title_id,
    date,
    date_precision = 'day',
    rating,
    notes,
    tags = [],
    people = [],
    picked_by,
  } = req.body;
  if (!title_id) return res.status(400).json({ error: 'title_id required' });
  checkLength(notes, LIMITS.notes, 'Notes');

  // One transaction: the viewing, its people, and the list/rotation side effects
  // land together or not at all — no half-logged viewings if a step throws.
  const logViewing = db.transaction(() => {
    const result = db
      .prepare(
        `
      INSERT INTO viewings (title_id, date, date_precision, rating, notes, tags, picked_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        title_id,
        date || null,
        date_precision,
        rating || null,
        notes || null,
        JSON.stringify(tags),
        picked_by || null
      );

    const viewingId = result.lastInsertRowid;

    for (const p of people) {
      db.prepare(
        'INSERT INTO viewing_people (viewing_id, person, role, rating) VALUES (?, ?, ?, ?)'
      ).run(viewingId, p.person, p.role || 'chooser', p.rating || null);
    }

    // Update added_by on the family_to_watch list item for this title if picked_by was specified
    if (picked_by) {
      const familyList = db.prepare("SELECT id FROM lists WHERE name = 'family_to_watch'").get();
      if (familyList) {
        db.prepare('UPDATE list_items SET added_by = ? WHERE title_id = ? AND list_id = ?').run(
          picked_by,
          title_id,
          familyList.id
        );
      }
    }

    // Remove from list_items if it was on family_to_watch and has family_movie_night tag
    if (tags.includes('family_movie_night')) {
      const familyList = db.prepare("SELECT id FROM lists WHERE name = 'family_to_watch'").get();
      if (familyList) {
        db.prepare('DELETE FROM list_items WHERE list_id = ? AND title_id = ?').run(
          familyList.id,
          title_id
        );
      }
      // Advance rotation — whoever's turn it was, it's now the next person's
      rotationCore.advanceRotation(db, req.app.locals.familyConfig.rotation);
    }

    return viewingId;
  });

  const viewingId = logViewing();

  res.json(
    db
      .prepare(
        'SELECT v.*, t.title FROM viewings v JOIN titles t ON v.title_id = t.id WHERE v.id = ?'
      )
      .get(viewingId)
  );
});

// PUT /api/viewings/:id
router.put('/:id', (req, res) => {
  const db = req.app.locals.db;
  const { date, date_precision, rating, notes, tags, people, picked_by } = req.body;
  checkLength(notes, LIMITS.notes, 'Notes');

  const existing = db.prepare('SELECT id FROM viewings WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Viewing not found' });

  // Only update rating if explicitly provided in the request body (preserves legacy group ratings)
  const ratingProvided = 'rating' in req.body;
  const pickedByProvided = 'picked_by' in req.body;
  // Transactional so the people replacement (delete + reinsert) can't be left
  // half-done — a failed reinsert would otherwise wipe the viewing's people.
  db.transaction(() => {
    db.prepare(
      `
      UPDATE viewings SET
        date = COALESCE(?, date),
        date_precision = COALESCE(?, date_precision),
        rating = CASE WHEN ? THEN ? ELSE rating END,
        notes = COALESCE(?, notes),
        tags = COALESCE(?, tags),
        picked_by = CASE WHEN ? THEN ? ELSE picked_by END
      WHERE id = ?
    `
    ).run(
      date,
      date_precision,
      ratingProvided ? 1 : 0,
      ratingProvided ? (rating ?? null) : null,
      notes,
      tags ? JSON.stringify(tags) : null,
      pickedByProvided ? 1 : 0,
      pickedByProvided ? (picked_by ?? null) : null,
      req.params.id
    );

    if (people) {
      db.prepare('DELETE FROM viewing_people WHERE viewing_id = ?').run(req.params.id);
      for (const p of people) {
        db.prepare(
          'INSERT INTO viewing_people (viewing_id, person, role, rating) VALUES (?, ?, ?, ?)'
        ).run(req.params.id, p.person, p.role || 'chooser', p.rating || null);
      }
    }
  })();

  res.json(db.prepare('SELECT * FROM viewings WHERE id = ?').get(req.params.id));
});

// DELETE /api/viewings/:id
router.delete('/:id', (req, res) => {
  const db = req.app.locals.db;
  const removed = db.transaction(() => {
    db.prepare('DELETE FROM viewing_people WHERE viewing_id = ?').run(req.params.id);
    return db.prepare('DELETE FROM viewings WHERE id = ?').run(req.params.id).changes;
  })();
  if (!removed) return res.status(404).json({ error: 'Viewing not found' });
  res.json({ success: true });
});

module.exports = router;
