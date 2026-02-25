const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/titles - search/list titles
router.get('/', (req, res) => {
  const { q, type, page = 1, limit = 50 } = req.query;
  const offset = (page - 1) * limit;

  let query = `
    SELECT t.*,
      (SELECT MAX(v.date) FROM viewings v WHERE v.title_id = t.id) as last_watched,
      (SELECT COUNT(*) FROM viewings v WHERE v.title_id = t.id) as view_count,
      (SELECT AVG(v.rating) FROM viewings v WHERE v.title_id = t.id AND v.rating IS NOT NULL) as avg_rating,
      (SELECT json_group_array(l.display_name) FROM list_items li2 JOIN lists l ON li2.list_id = l.id WHERE li2.title_id = t.id) as on_lists
    FROM titles t
    WHERE 1=1
  `;
  const params = [];
  const countParams = [];

  if (q) {
    query += ' AND (t.title LIKE ? OR t.director LIKE ? OR t.cast LIKE ? OR t.synopsis LIKE ?)';
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
    countParams.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (type) {
    query += ' AND t.type = ?';
    params.push(type);
    countParams.push(type);
  }

  query += ' ORDER BY t.title ASC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));

  const titles = db.prepare(query).all(...params);
  const countQuery = `SELECT COUNT(*) as c FROM titles t WHERE 1=1${q ? ' AND (t.title LIKE ? OR t.director LIKE ? OR t.cast LIKE ? OR t.synopsis LIKE ?)' : ''}${type ? ' AND t.type = ?' : ''}`;
  const total = db.prepare(countQuery).get(...countParams).c;

  res.json({ titles, total, page: parseInt(page), limit: parseInt(limit) });
});

// GET /api/titles/:id
router.get('/:id', (req, res) => {
  const title = db.prepare('SELECT * FROM titles WHERE id = ?').get(req.params.id);
  if (!title) return res.status(404).json({ error: 'Not found' });

  const viewings = db.prepare(`
    SELECT v.*,
      json_group_array(json_object('person', vp.person, 'role', vp.role, 'rating', vp.rating)) as people
    FROM viewings v
    LEFT JOIN viewing_people vp ON v.id = vp.viewing_id
    WHERE v.title_id = ?
    GROUP BY v.id
    ORDER BY v.date DESC NULLS LAST
  `).all(req.params.id);

  const listMemberships = db.prepare(`
    SELECT li.id as list_item_id, l.name, l.display_name, li.streaming_service, li.note, li.source, li.added_by
    FROM list_items li JOIN lists l ON li.list_id = l.id
    WHERE li.title_id = ?
  `).all(req.params.id);

  const collection = db.prepare(
    'SELECT * FROM collection WHERE title_id = ? ORDER BY added_at ASC'
  ).all(req.params.id);

  const shortlists = db.prepare(
    'SELECT id, person, context FROM shortlists WHERE title_id = ?'
  ).all(req.params.id);

  res.json({ ...title, viewings, listMemberships, collection, shortlists });
});

// POST /api/titles
router.post('/', (req, res) => {
  const { title, type = 'movie', tmdb_id, year, director, cast, genre, runtime_minutes, poster_url, synopsis } = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });

  const result = db.prepare(`
    INSERT INTO titles (title, title_raw, type, tmdb_id, year, director, cast, genre, runtime_minutes, poster_url, synopsis)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(title, title, type, tmdb_id || null, year || null, director || null,
    cast ? JSON.stringify(cast) : null,
    genre ? JSON.stringify(genre) : null,
    runtime_minutes || null, poster_url || null, synopsis || null);

  res.json(db.prepare('SELECT * FROM titles WHERE id = ?').get(result.lastInsertRowid));
});

// PUT /api/titles/:id
router.put('/:id', (req, res) => {
  const { title, type, year, director, cast, genre, runtime_minutes, poster_url, synopsis, tmdb_id } = req.body;

  db.prepare(`
    UPDATE titles SET
      title = COALESCE(?, title),
      type = COALESCE(?, type),
      year = COALESCE(?, year),
      director = COALESCE(?, director),
      cast = COALESCE(?, cast),
      genre = COALESCE(?, genre),
      runtime_minutes = COALESCE(?, runtime_minutes),
      poster_url = COALESCE(?, poster_url),
      synopsis = COALESCE(?, synopsis),
      tmdb_id = COALESCE(?, tmdb_id),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(title, type, year, director,
    cast ? JSON.stringify(cast) : null,
    genre ? JSON.stringify(genre) : null,
    runtime_minutes, poster_url, synopsis, tmdb_id, req.params.id);

  res.json(db.prepare('SELECT * FROM titles WHERE id = ?').get(req.params.id));
});

module.exports = router;
