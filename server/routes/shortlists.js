const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/shortlists?context=family
router.get('/', (req, res) => {
  const { context } = req.query;
  if (!context) return res.status(400).json({ error: 'context required' });

  const items = db.prepare(`
    SELECT s.*, t.title, t.poster_url, t.year
    FROM shortlists s
    JOIN titles t ON s.title_id = t.id
    WHERE s.context = ?
    ORDER BY s.created_at ASC
  `).all(context);

  // Group by title_id: { title_id -> [persons] }
  const grouped = {};
  for (const row of items) {
    if (!grouped[row.title_id]) {
      grouped[row.title_id] = { title_id: row.title_id, title: row.title, poster_url: row.poster_url, year: row.year, people: [] };
    }
    grouped[row.title_id].people.push(row.person);
  }

  res.json(Object.values(grouped));
});

// POST /api/shortlists - add or remove (toggle)
router.post('/', (req, res) => {
  const { title_id, person, context } = req.body;
  if (!title_id || !person || !context) return res.status(400).json({ error: 'title_id, person, context required' });

  const existing = db.prepare('SELECT id FROM shortlists WHERE title_id = ? AND person = ? AND context = ?').get(title_id, person, context);
  if (existing) {
    db.prepare('DELETE FROM shortlists WHERE id = ?').run(existing.id);
    return res.json({ action: 'removed', title_id, person, context });
  }

  db.prepare('INSERT INTO shortlists (title_id, person, context) VALUES (?, ?, ?)').run(title_id, person, context);
  res.json({ action: 'added', title_id, person, context });
});

// DELETE /api/shortlists/:id
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM shortlists WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
