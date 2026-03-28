const express = require('express');
const router = express.Router();
const db = require('../db');

/**
 * GET /api/what-to-watch/:context
 *
 * Returns list items for a given viewing context (e.g. family, nupur, solo).
 * Joins titles, list_items, lists, shortlists, and collection data.
 * For the "family" context, excludes titles watched in the last 12 months.
 *
 * @param {string} req.params.context - The viewing context id (must match a key in contextListMap)
 * @returns {Array} List items with full title metadata, shortlist info, and collection entries
 */
router.get('/:context', (req, res) => {
  const { context } = req.params;
  const contextListMap = req.app.locals.contextListMap;

  const listNames = contextListMap[context];
  if (!listNames) return res.status(400).json({ error: 'Unknown context' });

  const placeholders = listNames.map(() => '?').join(',');
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);
  const cutoffDate = twelveMonthsAgo.toISOString().split('T')[0];

  let query = `
    SELECT
      t.id, t.title, t.year, t.director, t.genre, t.runtime_minutes,
      t.poster_url, t.synopsis, t.type, t.cast, t.watch_providers,
      li.id as list_item_id, li.streaming_service, li.source, li.note, li.added_at, li.added_by,
      l.name as list_name, l.display_name as list_display_name,
      (SELECT MAX(v.date) FROM viewings v WHERE v.title_id = t.id) as last_watched,
      (SELECT COUNT(*) FROM viewings v WHERE v.title_id = t.id) as view_count,
      (SELECT json_group_array(s.person) FROM shortlists s WHERE s.title_id = t.id AND s.context = ?) as shortlisted_by,
      (SELECT json_group_array(json_object('format', c.format, 'platform', c.platform)) FROM collection c WHERE c.title_id = t.id) as collection_entries
    FROM list_items li
    JOIN lists l ON li.list_id = l.id
    JOIN titles t ON li.title_id = t.id
    WHERE l.name IN (${placeholders})
  `;
  const params = [context, ...listNames];

  if (context === 'family') {
    query += ' AND NOT EXISTS (SELECT 1 FROM viewings v WHERE v.title_id = t.id AND v.date >= ?)';
    params.push(cutoffDate);
  }

  query += ' ORDER BY li.priority ASC, li.added_at ASC';

  const items = db.prepare(query).all(...params);
  res.json(items);
});

module.exports = router;
