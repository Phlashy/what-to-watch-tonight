const express = require('express');
const router = express.Router();
const { getImdbIdFromTmdb, fetchOmdbRatings } = require('../lib/ratings');

const TMDB_BASE = 'https://api.themoviedb.org/3';
const API_KEY = process.env.TMDB_API_KEY;
const OMDB_API_KEY = process.env.OMDB_API_KEY;

// Shared timeout so a hung TMDB request can't hang ours indefinitely.
const fetchTmdb = (url) => fetch(url, { signal: AbortSignal.timeout(10000) });

// Friendly 503 (instead of a confusing upstream 401) when the key isn't set.
router.use((req, res, next) => {
  if (!API_KEY || API_KEY === 'your_tmdb_api_key_here') {
    return res.status(503).json({
      error: 'TMDB is not configured. Set TMDB_API_KEY in .env and restart the server.',
    });
  }
  next();
});

// GET /api/tmdb/search?q=title&type=movie|tv|multi
router.get('/search', async (req, res, next) => {
  const { q, type = 'movie' } = req.query;
  if (!q) return res.status(400).json({ error: 'q required' });

  try {
    if (type === 'multi') {
      // Run parallel movie + tv searches so TV shows are never drowned out by
      // popular movies. TMDB's /search/multi ranks everything together by
      // popularity, which means a niche TV show disappears behind movie results.
      const [movieRes, tvRes] = await Promise.all([
        fetchTmdb(`${TMDB_BASE}/search/movie?api_key=${API_KEY}&query=${encodeURIComponent(q)}`),
        fetchTmdb(`${TMDB_BASE}/search/tv?api_key=${API_KEY}&query=${encodeURIComponent(q)}`),
      ]);
      const [movieData, tvData] = await Promise.all([movieRes.json(), tvRes.json()]);
      const movies = (movieData.results || [])
        .slice(0, 5)
        .map((r) => ({ ...r, media_type: 'movie' }));
      const shows = (tvData.results || []).slice(0, 5).map((r) => ({ ...r, media_type: 'tv' }));
      // Sort by TMDB popularity so the most relevant result surfaces first
      // regardless of type — avoids burying a niche TV show behind popular movies
      const combined = [...movies, ...shows].sort(
        (a, b) => (b.popularity || 0) - (a.popularity || 0)
      );
      return res.json(combined);
    }

    const endpoint = type === 'tv' ? 'tv' : 'movie';
    const url = `${TMDB_BASE}/search/${endpoint}?api_key=${API_KEY}&query=${encodeURIComponent(q)}`;
    const response = await fetchTmdb(url);
    const data = await response.json();
    res.json(data.results?.slice(0, 10) || []);
  } catch (e) {
    next(e); // global handler logs it and hides details in production
  }
});

// GET /api/tmdb/movie/:id
router.get('/movie/:id', async (req, res, next) => {
  const url = `${TMDB_BASE}/movie/${req.params.id}?api_key=${API_KEY}&append_to_response=credits`;
  try {
    const response = await fetchTmdb(url);
    const data = await response.json();
    res.json(data);
  } catch (e) {
    next(e); // global handler logs it and hides details in production
  }
});

// GET /api/tmdb/tv/:id
router.get('/tv/:id', async (req, res, next) => {
  const url = `${TMDB_BASE}/tv/${req.params.id}?api_key=${API_KEY}&append_to_response=credits`;
  try {
    const response = await fetchTmdb(url);
    const data = await response.json();
    res.json(data);
  } catch (e) {
    next(e); // global handler logs it and hides details in production
  }
});

// POST /api/tmdb/enrich/:titleId - enrich a title from TMDB
router.post('/enrich/:titleId', async (req, res, next) => {
  const db = req.app.locals.db;
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
      const searchRes = await fetchTmdb(searchUrl);
      const searchData = await searchRes.json();
      if (!searchData.results?.length) return res.status(404).json({ error: 'No TMDB results' });
      searchId = searchData.results[0].id;
    }

    const detailUrl = `${TMDB_BASE}/${tmdb_type}/${searchId}?api_key=${API_KEY}&append_to_response=credits`;
    const detailRes = await fetchTmdb(detailUrl);
    details = await detailRes.json();

    const tmdbTitle = details.title || details.name || null;
    const director = details.credits?.crew?.find((c) => c.job === 'Director')?.name || null;
    const cast = JSON.stringify(details.credits?.cast?.slice(0, 5).map((c) => c.name) || []);
    const genres = JSON.stringify(details.genres?.map((g) => g.name) || []);
    const runtime = details.runtime || null;
    const posterUrl = details.poster_path
      ? `https://image.tmdb.org/t/p/w500${details.poster_path}`
      : null;
    const synopsis = details.overview || null;
    const year = (details.release_date || details.first_air_date || '').split('-')[0] || null;

    const correctType = tmdb_type === 'tv' ? 'show' : 'movie';
    db.prepare(
      `
      UPDATE titles SET
        title = ?, tmdb_id = ?, type = ?, year = ?, director = ?, cast = ?, genre = ?,
        runtime_minutes = ?, poster_url = ?, synopsis = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `
    ).run(
      tmdbTitle,
      searchId,
      correctType,
      year ? parseInt(year) : null,
      director,
      cast,
      genres,
      runtime,
      posterUrl,
      synopsis,
      req.params.titleId
    );

    // Ratings are keyed off the IMDb id, which comes from this TMDB match — so a
    // re-match can change which RT/IMDb/Metacritic scores are correct. Refresh
    // them best-effort: a failure here must not undo a successful TMDB fix.
    if (OMDB_API_KEY) {
      try {
        const imdbId = details.imdb_id || (await getImdbIdFromTmdb(searchId, correctType, API_KEY));
        if (imdbId) {
          const ratings = await fetchOmdbRatings(imdbId, OMDB_API_KEY);
          db.prepare(
            `UPDATE titles SET imdb_id = ?, rt_score = ?, imdb_rating = ?, metacritic_score = ?,
               ratings_updated_at = CURRENT_TIMESTAMP WHERE id = ?`
          ).run(
            imdbId,
            ratings?.rt ?? null,
            ratings?.imdb ?? null,
            ratings?.metacritic ?? null,
            req.params.titleId
          );
        }
      } catch {
        /* best effort — leave existing ratings untouched */
      }
    }

    res.json(db.prepare('SELECT * FROM titles WHERE id = ?').get(req.params.titleId));
  } catch (e) {
    next(e); // global handler logs it and hides details in production
  }
});

// GET /api/tmdb/watch-providers/:titleId — fetch & cache streaming availability.
// Region comes from family.config.json (`watchProvidersRegion`); defaults to CA.
router.get('/watch-providers/:titleId', async (req, res, next) => {
  const db = req.app.locals.db;
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
    const region = req.app.locals.familyConfig.watchProvidersRegion || 'CA';
    const response = await fetchTmdb(url);
    const data = await response.json();
    const providers = data.results?.[region] || null;
    const now = new Date().toISOString();

    db.prepare(
      'UPDATE titles SET watch_providers = ?, watch_providers_updated_at = ? WHERE id = ?'
    ).run(providers ? JSON.stringify(providers) : null, now, title.id);

    res.json({ watch_providers: providers, watch_providers_updated_at: now, title_id: title.id });
  } catch (e) {
    next(e); // global handler logs it and hides details in production
  }
});

module.exports = router;
