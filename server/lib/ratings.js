/**
 * Shared ratings logic — used by the backfill script (scripts/enrich-ratings.js),
 * the refresh route (server/routes/ratings.js), and the TMDB re-match handler
 * (server/routes/tmdb.js) so all three resolve IMDb ids and parse OMDb the same way.
 *
 * Rotten Tomatoes has no public API, so scores come from OMDb (omdbapi.com), keyed
 * by IMDb id. The IMDb id itself comes from TMDB's /external_ids (movies and shows).
 */
const TMDB_BASE = 'https://api.themoviedb.org/3';
const OMDB_BASE = 'https://www.omdbapi.com/';

// 10s ceiling so a hung upstream can't hang our request.
async function fetchJSON(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`${res.status}: ${url}`);
  return res.json();
}

/**
 * Pull a tt-style IMDb id out of a raw id or an imdb.com URL the user pasted.
 * Returns the normalised id (e.g. "tt0117951") or null if none is present.
 */
function parseImdbId(input) {
  if (!input) return null;
  const m = String(input).match(/tt\d{6,}/i);
  return m ? m[0].toLowerCase() : null;
}

/** TMDB id → IMDb id. Movies and shows live under different path segments. */
async function getImdbIdFromTmdb(tmdbId, type, apiKey) {
  const endpoint = type === 'show' ? 'tv' : 'movie';
  const data = await fetchJSON(`${TMDB_BASE}/${endpoint}/${tmdbId}/external_ids?api_key=${apiKey}`);
  return data.imdb_id || null;
}

/**
 * OMDb lookup by IMDb id → { rt, imdb, metacritic, omdbTitle, omdbYear }.
 * Any score may be null if OMDb lacks it; returns null entirely if OMDb has no
 * record for the id at all (e.g. "Incorrect IMDb ID").
 */
async function fetchOmdbRatings(imdbId, apiKey) {
  // Note: NOT passing &tomatoes=true. That flag makes OMDb scrape Rotten Tomatoes
  // live (2-10s, sometimes past our timeout) for fields we don't use — the RT
  // score is already in the standard response's Ratings array.
  const data = await fetchJSON(`${OMDB_BASE}?apikey=${apiKey}&i=${imdbId}`);
  if (data.Response === 'False') return null;

  const rtRaw = (data.Ratings || []).find((r) => r.Source === 'Rotten Tomatoes')?.Value; // "93%"
  const rt = rtRaw ? parseInt(rtRaw, 10) : null;
  const imdb = data.imdbRating && data.imdbRating !== 'N/A' ? parseFloat(data.imdbRating) : null;
  const metacritic =
    data.Metascore && data.Metascore !== 'N/A' ? parseInt(data.Metascore, 10) : null;

  return {
    rt: Number.isNaN(rt) ? null : rt,
    imdb: Number.isNaN(imdb) ? null : imdb,
    metacritic: Number.isNaN(metacritic) ? null : metacritic,
    omdbTitle: data.Title || null,
    omdbYear: data.Year || null,
  };
}

module.exports = { parseImdbId, getImdbIdFromTmdb, fetchOmdbRatings };
