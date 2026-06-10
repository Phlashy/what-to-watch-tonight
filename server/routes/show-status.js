const express = require('express');
const router = express.Router();
const { noOneStillEngaged } = require('../lib/show-status');

// GET /api/show-status?title_id=X  — all statuses for a title
router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const { title_id } = req.query;
  if (!title_id) return res.status(400).json({ error: 'title_id required' });
  const statuses = db.prepare('SELECT * FROM show_status WHERE title_id = ?').all(title_id);
  res.json(statuses);
});

// POST /api/show-status  — set (upsert) status for a person
// Body: { title_id, person, status, started_date?, ended_date?, notes? }
// Setting status to 'finished' or 'dropped' auto-removes the show from all lists.
router.post('/', (req, res) => {
  const db = req.app.locals.db;
  const { title_id, person, status, started_date, ended_date, notes } = req.body;
  if (!title_id || !person || !status)
    return res.status(400).json({ error: 'title_id, person, status required' });

  const validStatuses = ['wishlist', 'watching', 'finished', 'dropped'];
  if (!validStatuses.includes(status))
    return res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}` });

  db.prepare(
    `
    INSERT INTO show_status (title_id, person, status, started_date, ended_date, notes, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(title_id, person) DO UPDATE SET
      status = excluded.status,
      started_date = COALESCE(excluded.started_date, started_date),
      ended_date = excluded.ended_date,
      notes = COALESCE(excluded.notes, notes),
      updated_at = CURRENT_TIMESTAMP
  `
  ).run(title_id, person, status, started_date || null, ended_date || null, notes || null);

  // Auto-remove from to-watch lists only once nobody is still wishlist/watching,
  // so one person finishing/dropping doesn't empty shared lists for everyone else.
  if ((status === 'finished' || status === 'dropped') && noOneStillEngaged(db, title_id)) {
    db.prepare('DELETE FROM list_items WHERE title_id = ?').run(title_id);
  }

  const statuses = db.prepare('SELECT * FROM show_status WHERE title_id = ?').all(title_id);
  res.json(statuses);
});

// DELETE /api/show-status  — clear status for a person
// Body: { title_id, person }
router.delete('/', (req, res) => {
  const db = req.app.locals.db;
  const { title_id, person } = req.body;
  if (!title_id || !person) return res.status(400).json({ error: 'title_id and person required' });
  db.prepare('DELETE FROM show_status WHERE title_id = ? AND person = ?').run(title_id, person);
  const statuses = db.prepare('SELECT * FROM show_status WHERE title_id = ?').all(title_id);
  res.json(statuses);
});

// GET /api/show-status/log  — all shows with viewings, grouped by title, sorted by most recent viewing
// Query params: search (title filter), page, limit
router.get('/log', (req, res) => {
  const db = req.app.locals.db;
  const { search } = req.query;
  // Clamp pagination — uncapped limits would let one request dump every row.
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const offset = (page - 1) * limit;

  const params = [];
  let whereClause = "WHERE t.type = 'show'";
  if (search) {
    whereClause += ' AND t.title LIKE ?';
    params.push(`%${search}%`);
  }

  const rows = db
    .prepare(
      `
    SELECT
      t.id as title_id,
      t.title,
      t.year,
      t.poster_url,
      t.genre,
      COUNT(DISTINCT v.id) as viewing_count,
      MAX(v.date) as last_watched,
      MAX(v.created_at) as last_created,
      json_group_array(DISTINCT json_object('person', vp.person, 'rating', vp.rating)) as people_json,
      (SELECT json_group_array(json_object('person', ss.person, 'status', ss.status))
       FROM show_status ss WHERE ss.title_id = t.id) as statuses_json
    FROM titles t
    JOIN viewings v ON t.id = v.title_id
    LEFT JOIN viewing_people vp ON v.id = vp.viewing_id
    ${whereClause}
    GROUP BY t.id
    ORDER BY MAX(v.date) DESC NULLS LAST, MAX(v.created_at) DESC
    LIMIT ? OFFSET ?
  `
    )
    .all(...params, limit, offset);

  // Count total for pagination
  const total = db
    .prepare(
      `
    SELECT COUNT(DISTINCT t.id) as count
    FROM titles t JOIN viewings v ON t.id = v.title_id
    ${whereClause}
  `
    )
    .get(...params).count;

  res.json({ shows: rows, total, page, limit });
});

module.exports = router;
