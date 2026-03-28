const express = require('express');
const router = express.Router();
const db = require('../db');

/**
 * GET /api/stats
 *
 * Returns high-level statistics for the Movie Night app:
 * - totalWatched: number of viewings logged
 * - totalTitles: number of titles in the database
 * - totalToWatch: number of items across all watch lists
 * - recentWatched: the 5 most recently watched titles with date and rating
 */
router.get('/', (req, res) => {
  const totalWatched = db.prepare('SELECT COUNT(*) as count FROM viewings').get();
  const totalTitles = db.prepare('SELECT COUNT(*) as count FROM titles').get();
  const totalToWatch = db.prepare('SELECT COUNT(*) as count FROM list_items').get();
  const recentWatched = db.prepare(`
    SELECT t.title, v.date, v.rating
    FROM viewings v JOIN titles t ON v.title_id = t.id
    WHERE v.date IS NOT NULL
    ORDER BY v.date DESC LIMIT 5
  `).all();

  res.json({
    totalWatched: totalWatched.count,
    totalTitles: totalTitles.count,
    totalToWatch: totalToWatch.count,
    recentWatched,
  });
});

module.exports = router;
