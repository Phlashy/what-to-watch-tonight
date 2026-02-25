const express = require('express');
const router = express.Router();

const TMDB_BASE = 'https://api.themoviedb.org/3';
const API_KEY = process.env.TMDB_API_KEY;

// GET /api/tmdb/search?q=title&type=movie|tv|multi
router.get('/search', async (req, res) => {
  const { q, type = 'movie' } = req.query;
  if (!q) return res.status(400).json({ error: 'q required' });

  const endpoint = type === 'tv' ? 'tv' : type === 'multi' ? 'multi' : 'movie';
  const url = `${TMDB_BASE}/search/${endpoint}?api_key=${API_KEY}&query=${encodeURIComponent(q)}`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    // For multi-search, filter out person results
    let results = data.results?.slice(0, 10) || [];
    if (type === 'multi') {
      results = results.filter(r => r.media_type !== 'person');
    }
    res.json(results);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/tmdb/movie/:id
router.get('/movie/:id', async (req, res) => {
  const url = `${TMDB_BASE}/movie/${req.params.id}?api_key=${API_KEY}&append_to_response=credits`;
  try {
    const response = await fetch(url);
    const data = await response.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/tmdb/tv/:id
router.get('/tv/:id', async (req, res) => {
  const url = `${TMDB_BASE}/tv/${req.params.id}?api_key=${API_KEY}&append_to_response=credits`;
  try {
    const response = await fetch(url);
    const data = await response.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/tmdb/enrich/:titleId - enrich a title from TMDB
router.post('/enrich/:titleId', async (req, res) => {
  const db = require('../db');
  const title = db.prepare('SELECT * FROM titles WHERE id = ?').get(req.params.titleId);
  if (!title) return res.status(404).json({ error: 'Title not found' });

  const { tmdb_id, tmdb_type = title.type === 'show' ? 'tv' : 'movie' } = req.body;

  try {
    let details;
    let searchId = tmdb_id;

    if (!searchId) {
      // Search first
      const endpoint = tmdb_type === 'tv' ? 'tv' : 'movie';
      const searchUrl = `${TMDB_BASE}/search/${endpoint}?api_key=${API_KEY}&query=${encodeURIComponent(title.title)}`;
      const searchRes = await fetch(searchUrl);
      const searchData = await searchRes.json();
      if (!searchData.results?.length) return res.status(404).json({ error: 'No TMDB results' });
      searchId = searchData.results[0].id;
    }

    const detailUrl = `${TMDB_BASE}/${tmdb_type}/${searchId}?api_key=${API_KEY}&append_to_response=credits`;
    const detailRes = await fetch(detailUrl);
    details = await detailRes.json();

    const tmdbTitle = details.title || details.name || null;
    const director = details.credits?.crew?.find(c => c.job === 'Director')?.name || null;
    const cast = JSON.stringify(details.credits?.cast?.slice(0, 5).map(c => c.name) || []);
    const genres = JSON.stringify(details.genres?.map(g => g.name) || []);
    const runtime = details.runtime || null;
    const posterUrl = details.poster_path ? `https://image.tmdb.org/t/p/w500${details.poster_path}` : null;
    const synopsis = details.overview || null;
    const year = (details.release_date || details.first_air_date || '').split('-')[0] || null;

    db.prepare(`
      UPDATE titles SET
        title = ?, tmdb_id = ?, year = ?, director = ?, cast = ?, genre = ?,
        runtime_minutes = ?, poster_url = ?, synopsis = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(tmdbTitle, searchId, year ? parseInt(year) : null, director, cast, genres, runtime, posterUrl, synopsis, req.params.titleId);

    res.json(db.prepare('SELECT * FROM titles WHERE id = ?').get(req.params.titleId));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/tmdb/watch-providers/:titleId — fetch & cache streaming availability (CA region)
router.get('/watch-providers/:titleId', async (req, res) => {
  const db = require('../db');
  const title = db.prepare('SELECT * FROM titles WHERE id = ?').get(req.params.titleId);
  if (!title) return res.status(404).json({ error: 'Title not found' });
  if (!title.tmdb_id) return res.status(400).json({ error: 'Title not enriched with TMDB' });

  // Return cached data unless refresh requested
  if (!req.query.refresh && title.watch_providers) {
    return res.json({
      watch_providers: JSON.parse(title.watch_providers),
      watch_providers_updated_at: title.watch_providers_updated_at,
      title_id: title.id,
    });
  }

  const tmdbType = title.type === 'show' ? 'tv' : 'movie';
  const url = `${TMDB_BASE}/${tmdbType}/${title.tmdb_id}/watch/providers?api_key=${API_KEY}`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    const ca = data.results?.CA || null;
    const now = new Date().toISOString();

    db.prepare('UPDATE titles SET watch_providers = ?, watch_providers_updated_at = ? WHERE id = ?')
      .run(ca ? JSON.stringify(ca) : null, now, title.id);

    res.json({ watch_providers: ca, watch_providers_updated_at: now, title_id: title.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
