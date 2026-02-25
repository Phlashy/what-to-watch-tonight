const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/viewings
router.get('/', (req, res) => {
  const { person, from, to, minRating, maxRating, tags, search, hasNotes, sort, page = 1, limit = 50 } = req.query;
  const offset = (page - 1) * limit;

  let query = `
    SELECT v.*, t.title, t.year, t.poster_url, t.type, t.genre, t.director,
      json_group_array(json_object('person', vp.person, 'role', vp.role, 'rating', vp.rating)) as people
    FROM viewings v
    JOIN titles t ON v.title_id = t.id
    LEFT JOIN viewing_people vp ON v.id = vp.viewing_id
    WHERE 1=1
  `;
  const params = [];

  if (search) {
    query += ' AND t.title LIKE ?';
    params.push(`%${search}%`);
  }
  if (from) {
    query += ' AND v.date >= ?';
    params.push(from);
  }
  if (to) {
    query += ' AND v.date <= ?';
    params.push(to);
  }
  if (minRating) {
    query += ' AND COALESCE((SELECT MAX(vp2.rating) FROM viewing_people vp2 WHERE vp2.viewing_id = v.id AND vp2.rating IS NOT NULL), v.rating) >= ?';
    params.push(parseInt(minRating));
  }
  if (maxRating) {
    query += ' AND COALESCE((SELECT MAX(vp2.rating) FROM viewing_people vp2 WHERE vp2.viewing_id = v.id AND vp2.rating IS NOT NULL), v.rating) <= ?';
    params.push(parseInt(maxRating));
  }
  if (tags) {
    const tagList = tags.split(',');
    for (const tag of tagList) {
      query += ' AND v.tags LIKE ?';
      params.push(`%${tag.trim()}%`);
    }
  }
  if (person) {
    query += ' AND EXISTS (SELECT 1 FROM viewing_people vp2 WHERE vp2.viewing_id = v.id AND vp2.person = ?)';
    params.push(person);
  }
  if (hasNotes === 'true') {
    query += " AND v.notes IS NOT NULL AND v.notes != ''";
  }

  if (sort === 'rating') {
    query += ' GROUP BY v.id ORDER BY COALESCE((SELECT MAX(vp3.rating) FROM viewing_people vp3 WHERE vp3.viewing_id = v.id AND vp3.rating IS NOT NULL), v.rating) DESC NULLS LAST, v.date DESC NULLS LAST';
  } else {
    query += ' GROUP BY v.id ORDER BY v.date DESC NULLS LAST, v.created_at DESC';
  }
  query += ' LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));

  const viewings = db.prepare(query).all(...params);

  // Count total (without pagination) — reuse filter params (all except LIMIT and OFFSET)
  const filterParams = params.slice(0, -2);
  let countQuery = `
    SELECT COUNT(DISTINCT v.id) as total
    FROM viewings v JOIN titles t ON v.title_id = t.id
    LEFT JOIN viewing_people vp ON v.id = vp.viewing_id
    WHERE 1=1
  `;
  if (search) { countQuery += ' AND t.title LIKE ?'; }
  if (from) { countQuery += ' AND v.date >= ?'; }
  if (to) { countQuery += ' AND v.date <= ?'; }
  if (minRating) { countQuery += ' AND COALESCE((SELECT MAX(vp2.rating) FROM viewing_people vp2 WHERE vp2.viewing_id = v.id AND vp2.rating IS NOT NULL), v.rating) >= ?'; }
  if (maxRating) { countQuery += ' AND COALESCE((SELECT MAX(vp2.rating) FROM viewing_people vp2 WHERE vp2.viewing_id = v.id AND vp2.rating IS NOT NULL), v.rating) <= ?'; }
  if (tags) { for (const tag of tags.split(',')) { countQuery += ' AND v.tags LIKE ?'; } }
  if (person) { countQuery += ' AND EXISTS (SELECT 1 FROM viewing_people vp2 WHERE vp2.viewing_id = v.id AND vp2.person = ?)'; }
  if (hasNotes === 'true') { countQuery += " AND v.notes IS NOT NULL AND v.notes != ''"; }
  const total = db.prepare(countQuery).get(...filterParams).total;

  res.json({ viewings, total, page: parseInt(page), limit: parseInt(limit) });
});

// POST /api/viewings
router.post('/', (req, res) => {
  const { title_id, date, date_precision = 'day', rating, notes, tags = [], people = [] } = req.body;
  if (!title_id) return res.status(400).json({ error: 'title_id required' });

  const result = db.prepare(`
    INSERT INTO viewings (title_id, date, date_precision, rating, notes, tags)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(title_id, date || null, date_precision, rating || null, notes || null, JSON.stringify(tags));

  const viewingId = result.lastInsertRowid;

  for (const p of people) {
    db.prepare('INSERT INTO viewing_people (viewing_id, person, role, rating) VALUES (?, ?, ?, ?)').run(viewingId, p.person, p.role || 'chooser', p.rating || null);
  }

  // Remove from list_items if it was on family_to_watch and has family_movie_night tag
  if (tags.includes('family_movie_night')) {
    const familyList = db.prepare("SELECT id FROM lists WHERE name = 'family_to_watch'").get();
    if (familyList) {
      db.prepare('DELETE FROM list_items WHERE list_id = ? AND title_id = ?').run(familyList.id, title_id);
    }
    // Clear any rotation skip override now that someone has chosen
    db.prepare("DELETE FROM settings WHERE key = 'family_rotation_next_override'").run();
  }

  res.json(db.prepare('SELECT v.*, t.title FROM viewings v JOIN titles t ON v.title_id = t.id WHERE v.id = ?').get(viewingId));
});

// PUT /api/viewings/:id
router.put('/:id', (req, res) => {
  const { date, date_precision, rating, notes, tags, people } = req.body;

  // Only update rating if explicitly provided in the request body (preserves legacy group ratings)
  const ratingProvided = 'rating' in req.body;
  db.prepare(`
    UPDATE viewings SET
      date = COALESCE(?, date),
      date_precision = COALESCE(?, date_precision),
      rating = CASE WHEN ? THEN ? ELSE rating END,
      notes = COALESCE(?, notes),
      tags = COALESCE(?, tags)
    WHERE id = ?
  `).run(date, date_precision, ratingProvided ? 1 : 0, ratingProvided ? (rating ?? null) : null, notes, tags ? JSON.stringify(tags) : null, req.params.id);

  if (people) {
    db.prepare('DELETE FROM viewing_people WHERE viewing_id = ?').run(req.params.id);
    for (const p of people) {
      db.prepare('INSERT INTO viewing_people (viewing_id, person, role, rating) VALUES (?, ?, ?, ?)').run(req.params.id, p.person, p.role || 'chooser', p.rating || null);
    }
  }

  res.json(db.prepare('SELECT * FROM viewings WHERE id = ?').get(req.params.id));
});

// DELETE /api/viewings/:id
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM viewing_people WHERE viewing_id = ?').run(req.params.id);
  db.prepare('DELETE FROM viewings WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
