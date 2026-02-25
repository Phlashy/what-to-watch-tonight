const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/collection — list all collection entries with title info
router.get('/', (req, res) => {
  const items = db.prepare(`
    SELECT c.*, t.title, t.poster_url, t.year, t.type
    FROM collection c
    JOIN titles t ON c.title_id = t.id
    ORDER BY c.added_at DESC
  `).all();
  res.json(items);
});

// GET /api/collection/title/:titleId — entries for a specific title
router.get('/title/:titleId', (req, res) => {
  const items = db.prepare('SELECT * FROM collection WHERE title_id = ?').all(req.params.titleId);
  res.json(items);
});

// POST /api/collection — add to collection
router.post('/', (req, res) => {
  const { title_id, format, platform, notes } = req.body;
  if (!title_id || !format) return res.status(400).json({ error: 'title_id and format required' });
  if (!['dvd', 'bluray', 'digital'].includes(format)) {
    return res.status(400).json({ error: 'format must be dvd, bluray, or digital' });
  }

  try {
    const result = db.prepare(
      'INSERT INTO collection (title_id, format, platform, notes) VALUES (?, ?, ?, ?)'
    ).run(title_id, format, platform || null, notes || null);
    res.json(db.prepare('SELECT * FROM collection WHERE id = ?').get(result.lastInsertRowid));
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Already in collection with this format' });
    }
    throw e;
  }
});

// DELETE /api/collection/:id — remove from collection
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM collection WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
