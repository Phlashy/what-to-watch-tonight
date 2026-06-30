const express = require('express');
const router = express.Router();
const { parseImdbId, getImdbIdFromTmdb, fetchOmdbRatings } = require('../lib/ratings');

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const OMDB_API_KEY = process.env.OMDB_API_KEY;

// Friendly 503 (instead of a confusing upstream error) when the key isn't set.
router.use((req, res, next) => {
  if (!OMDB_API_KEY) {
    return res.status(503).json({
      error: 'Ratings are not configured. Set OMDB_API_KEY in .env and restart the server.',
    });
  }
  next();
});

const updateRatings = (db) =>
  db.prepare(`
    UPDATE titles SET
      imdb_id = ?, rt_score = ?, imdb_rating = ?, metacritic_score = ?,
      ratings_updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

// POST /api/ratings/refresh/:titleId  body: { imdb_id? }
// Re-fetches RT/IMDb/Metacritic from OMDb. With no imdb_id it uses the one we
// have (or derives it from the TMDB match); pass an IMDb id or imdb.com URL to
// override a bad/missing match.
router.post('/refresh/:titleId', async (req, res, next) => {
  const db = req.app.locals.db;
  const title = db.prepare('SELECT * FROM titles WHERE id = ?').get(req.params.titleId);
  if (!title) return res.status(404).json({ error: 'Title not found' });

  try {
    const override = parseImdbId(req.body?.imdb_id);
    // A user typed something but it wasn't a valid IMDb id — say so plainly.
    if (req.body?.imdb_id && !override) {
      return res
        .status(400)
        .json({ error: 'That doesn’t look like an IMDb ID. Expected something like tt0117951.' });
    }

    let imdbId = override || title.imdb_id;
    if (!imdbId) {
      if (!title.tmdb_id) {
        return res.status(400).json({
          error: 'No TMDB match yet — fix the TMDB match first, or enter an IMDb ID.',
        });
      }
      imdbId = await getImdbIdFromTmdb(title.tmdb_id, title.type, TMDB_API_KEY);
    }
    if (!imdbId) {
      return res
        .status(404)
        .json({ error: 'No IMDb ID found for this title. Enter one manually (e.g. tt0117951).' });
    }

    const ratings = await fetchOmdbRatings(imdbId, OMDB_API_KEY);
    if (!ratings) {
      return res
        .status(404)
        .json({ error: `OMDb has no entry for ${imdbId}. Double-check the IMDb ID.` });
    }

    updateRatings(db).run(imdbId, ratings.rt, ratings.imdb, ratings.metacritic, title.id);

    res.json({
      title: db.prepare('SELECT * FROM titles WHERE id = ?').get(title.id),
      found: ratings,
      imdb_id: imdbId,
    });
  } catch (e) {
    next(e); // global handler logs it and hides details in production
  }
});

module.exports = router;
