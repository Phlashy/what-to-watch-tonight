const express = require('express');
const router = express.Router();
const { checkLength, LIMITS } = require('../lib/validate');

// GET /api/lists
router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const lists = db
    .prepare(
      `
    SELECT l.*, COUNT(li.id) as item_count, MAX(li.added_at) as last_added
    FROM lists l
    LEFT JOIN list_items li ON l.id = li.list_id
    GROUP BY l.id
    ORDER BY l.id ASC
  `
    )
    .all();
  res.json(lists);
});

// POST /api/lists — create a new list
router.post('/', (req, res) => {
  const db = req.app.locals.db;
  const { name, display_name, description } = req.body;
  if (!name || !display_name)
    return res.status(400).json({ error: 'name and display_name required' });
  checkLength(display_name, LIMITS.name, 'List name');
  checkLength(description, LIMITS.notes, 'Description');
  // Sanitise: lowercase, letters/numbers/underscores only
  const safeName = name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  try {
    const result = db
      .prepare('INSERT INTO lists (name, display_name, description) VALUES (?, ?, ?)')
      .run(safeName, display_name, description || null);
    res.json(db.prepare('SELECT * FROM lists WHERE id = ?').get(result.lastInsertRowid));
  } catch (e) {
    if (e.message.includes('UNIQUE'))
      return res.status(409).json({ error: 'A list with that name already exists' });
    throw e;
  }
});

// PUT /api/lists/:name — rename a list / edit its description or icon
router.put('/:name', (req, res) => {
  const db = req.app.locals.db;
  const { display_name, description, icon } = req.body;
  checkLength(display_name, LIMITS.name, 'List name');
  checkLength(description, LIMITS.notes, 'Description');
  const list = db.prepare('SELECT * FROM lists WHERE name = ?').get(req.params.name);
  if (!list) return res.status(404).json({ error: 'List not found' });
  db.prepare(
    `UPDATE lists SET
       display_name = COALESCE(?, display_name),
       description = COALESCE(?, description),
       icon = COALESCE(?, icon)
     WHERE id = ?`
  ).run(display_name ?? null, description ?? null, icon ?? null, list.id);
  res.json(db.prepare('SELECT * FROM lists WHERE id = ?').get(list.id));
});

// DELETE /api/lists/:name — delete a list and its memberships (titles untouched)
router.delete('/:name', (req, res) => {
  const db = req.app.locals.db;
  const list = db.prepare('SELECT * FROM lists WHERE name = ?').get(req.params.name);
  if (!list) return res.status(404).json({ error: 'List not found' });
  db.transaction(() => {
    db.prepare('DELETE FROM list_items WHERE list_id = ?').run(list.id);
    db.prepare('DELETE FROM lists WHERE id = ?').run(list.id);
  })();
  res.json({ success: true });
});

// GET /api/lists/:name/items
router.get('/:name/items', (req, res) => {
  const db = req.app.locals.db;
  const list = db.prepare('SELECT * FROM lists WHERE name = ?').get(req.params.name);
  if (!list) return res.status(404).json({ error: 'List not found' });

  const items = db
    .prepare(
      `
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
  `
    )
    .all(list.id);

  res.json({ list, items });
});

// POST /api/lists/:name/items
router.post('/:name/items', (req, res) => {
  const db = req.app.locals.db;
  const list = db.prepare('SELECT * FROM lists WHERE name = ?').get(req.params.name);
  if (!list) return res.status(404).json({ error: 'List not found' });

  const { title_id, streaming_service, source, note, priority, added_by } = req.body;
  if (!title_id) return res.status(400).json({ error: 'title_id required' });

  try {
    const result = db
      .prepare(
        `
      INSERT INTO list_items (list_id, title_id, streaming_service, source, note, priority, added_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        list.id,
        title_id,
        streaming_service || null,
        source || null,
        note || null,
        priority || null,
        added_by || null
      );

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
  const db = req.app.locals.db;
  const { streaming_service, note, source, priority, added_by } = req.body;
  const addedByProvided = 'added_by' in req.body;
  // Scope the item to the list named in the URL — an id from another list must
  // not be mutable through this list's path.
  const item = db
    .prepare(
      `SELECT li.id FROM list_items li
       JOIN lists l ON li.list_id = l.id
       WHERE li.id = ? AND l.name = ?`
    )
    .get(req.params.itemId, req.params.name);
  if (!item) return res.status(404).json({ error: 'List item not found on this list' });
  db.prepare(
    `
    UPDATE list_items SET
      streaming_service = COALESCE(?, streaming_service),
      note = COALESCE(?, note),
      source = COALESCE(?, source),
      priority = COALESCE(?, priority),
      added_by = CASE WHEN ? THEN ? ELSE added_by END
    WHERE id = ?
  `
  ).run(
    streaming_service,
    note,
    source,
    priority,
    addedByProvided ? 1 : 0,
    addedByProvided ? (added_by ?? null) : null,
    req.params.itemId
  );
  res.json({ success: true });
});

// POST /api/lists/items/reorder — bulk priority update by list-item id.
// Body: { order: [listItemId, listItemId, ...] }
// Not scoped to one list: the Tonight view reorders a context that can merge
// several lists, so the ids may span lists. (Replaces the old
// /:name/items/reorder route, whose :name was ignored.)
router.post('/items/reorder', (req, res) => {
  const db = req.app.locals.db;
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
  const db = req.app.locals.db;
  // Scope the delete to the list named in the URL — an id from another list
  // must not be deletable through this list's path.
  const { changes } = db
    .prepare(
      `DELETE FROM list_items
       WHERE id = ? AND list_id = (SELECT id FROM lists WHERE name = ?)`
    )
    .run(req.params.itemId, req.params.name);
  if (!changes) return res.status(404).json({ error: 'List item not found on this list' });
  res.json({ success: true });
});

module.exports = router;
