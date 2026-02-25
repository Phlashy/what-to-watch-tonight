const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/lists
router.get('/', (req, res) => {
  const lists = db.prepare(`
    SELECT l.*, COUNT(li.id) as item_count
    FROM lists l
    LEFT JOIN list_items li ON l.id = li.list_id
    GROUP BY l.id
    ORDER BY l.id ASC
  `).all();
  res.json(lists);
});

// GET /api/lists/:name/items
router.get('/:name/items', (req, res) => {
  const list = db.prepare('SELECT * FROM lists WHERE name = ?').get(req.params.name);
  if (!list) return res.status(404).json({ error: 'List not found' });

  const items = db.prepare(`
    SELECT li.*, t.title, t.year, t.director, t.genre, t.runtime_minutes,
      t.poster_url, t.synopsis, t.type, t.cast, t.tmdb_id,
      (SELECT MAX(v.date) FROM viewings v WHERE v.title_id = t.id) as last_watched,
      (SELECT COUNT(*) FROM viewings v WHERE v.title_id = t.id) as view_count,
      (SELECT ROUND(AVG(r), 1) FROM (
        SELECT vp.rating as r FROM viewings v2
        JOIN viewing_people vp ON v2.id = vp.viewing_id
        WHERE v2.title_id = t.id AND vp.rating IS NOT NULL
        UNION ALL
        SELECT v3.rating as r FROM viewings v3
        WHERE v3.title_id = t.id AND v3.rating IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM viewing_people vp2 WHERE vp2.viewing_id = v3.id AND vp2.rating IS NOT NULL)
      )) as avg_rating
    FROM list_items li
    JOIN titles t ON li.title_id = t.id
    WHERE li.list_id = ?
    ORDER BY li.priority ASC, li.added_at ASC
  `).all(list.id);

  res.json({ list, items });
});

// POST /api/lists/:name/items
router.post('/:name/items', (req, res) => {
  const list = db.prepare('SELECT * FROM lists WHERE name = ?').get(req.params.name);
  if (!list) return res.status(404).json({ error: 'List not found' });

  const { title_id, streaming_service, source, note, priority, added_by } = req.body;
  if (!title_id) return res.status(400).json({ error: 'title_id required' });

  try {
    const result = db.prepare(`
      INSERT INTO list_items (list_id, title_id, streaming_service, source, note, priority, added_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(list.id, title_id, streaming_service || null, source || null, note || null, priority || null, added_by || null);

    res.json({ id: result.lastInsertRowid, list_id: list.id, title_id });
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Already on this list' });
    }
    throw e;
  }
});

// PUT /api/lists/:name/items/:itemId
router.put('/:name/items/:itemId', (req, res) => {
  const { streaming_service, note, source, priority, added_by } = req.body;
  const addedByProvided = 'added_by' in req.body;
  db.prepare(`
    UPDATE list_items SET
      streaming_service = COALESCE(?, streaming_service),
      note = COALESCE(?, note),
      source = COALESCE(?, source),
      priority = COALESCE(?, priority),
      added_by = CASE WHEN ? THEN ? ELSE added_by END
    WHERE id = ?
  `).run(streaming_service, note, source, priority, addedByProvided ? 1 : 0, addedByProvided ? (added_by ?? null) : null, req.params.itemId);
  res.json({ success: true });
});

// POST /api/lists/:name/items/reorder — bulk priority update
// Body: { order: [listItemId, listItemId, ...] }
router.post('/:name/items/reorder', (req, res) => {
  const { order } = req.body;
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order array required' });
  const update = db.prepare('UPDATE list_items SET priority = ? WHERE id = ?');
  const tx = db.transaction((ids) => {
    ids.forEach((id, i) => update.run(i + 1, id));
  });
  tx(order);
  res.json({ success: true });
});

// DELETE /api/lists/:name/items/:itemId
router.delete('/:name/items/:itemId', (req, res) => {
  db.prepare('DELETE FROM list_items WHERE id = ?').run(req.params.itemId);
  res.json({ success: true });
});

module.exports = router;
