#!/usr/bin/env node
/**
 * Ratings Enrichment Script
 *
 * Fetches Rotten Tomatoes (Tomatometer), IMDb, and Metacritic scores plus the US
 * age certificate (PG, PG-13, R; TV-14, TV-MA for shows) for every title that has
 * a TMDB id but no ratings yet, and stores them on the title.
 *
 * Rotten Tomatoes has no public API, so we go via OMDb (omdbapi.com), which
 * returns all three scores in one call keyed by IMDb id. We get the IMDb id from
 * TMDB's /external_ids endpoint (works for both movies and shows).
 *
 * Requires OMDB_API_KEY (free, instant at https://www.omdbapi.com/apikey.aspx)
 * and the existing TMDB_API_KEY in .env.
 *
 * Run: npm run enrich:ratings
 *      npm run enrich:ratings -- --certs-only   (back-fill certificates only)
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env'), override: true });

const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');
const { getImdbIdFromTmdb, fetchOmdbRatings } = require('../server/lib/ratings');

function expandPath(p) {
  return p.replace(/^~/, os.homedir());
}

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const OMDB_API_KEY = process.env.OMDB_API_KEY;
const DB_PATH = expandPath(
  process.env.DB_PATH || path.join(os.homedir(), 'movie-night-data', 'movies.db')
);

if (!TMDB_API_KEY) {
  console.error('TMDB_API_KEY not set in .env');
  process.exit(1);
}
if (!OMDB_API_KEY) {
  console.error(
    'OMDB_API_KEY not set in .env — get a free key at https://www.omdbapi.com/apikey.aspx'
  );
  process.exit(1);
}

const db = new Database(DB_PATH);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const updateRatings = db.prepare(`
  UPDATE titles SET
    imdb_id = ?, rt_score = ?, imdb_rating = ?, metacritic_score = ?,
    content_rating = ?, ratings_updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`);

async function enrichTitle(row) {
  const imdbId = row.imdb_id || (await getImdbIdFromTmdb(row.tmdb_id, row.type, TMDB_API_KEY));
  if (!imdbId) {
    console.log(`  ✗ No IMDb id: "${row.title}"`);
    return false;
  }

  const ratings = await fetchOmdbRatings(imdbId, OMDB_API_KEY);
  if (!ratings) {
    console.log(`  ✗ OMDb had nothing for "${row.title}" (${imdbId})`);
    return false;
  }

  updateRatings.run(
    imdbId,
    ratings.rt,
    ratings.imdb,
    ratings.metacritic,
    ratings.contentRating,
    row.id
  );
  const parts = [
    ratings.contentRating,
    ratings.rt != null ? `🍅${ratings.rt}%` : null,
    ratings.imdb != null ? `IMDb ${ratings.imdb}` : null,
    ratings.metacritic != null ? `MC ${ratings.metacritic}` : null,
  ].filter(Boolean);
  console.log(`  ✓ "${row.title}" → ${parts.join('  ') || 'no scores'}`);
  return true;
}

async function main() {
  // Default: titles enriched by TMDB (so we can resolve an IMDb id) that we
  // haven't fetched ratings for yet. Re-runs are idempotent — ratings_updated_at
  // gates them.
  //
  // --certs-only: the one-off back-fill for the age certificate, added after the
  // scores were already populated. Those rows have a ratings_updated_at, so the
  // default query skips them forever; this targets exactly the rows that have an
  // IMDb id but no certificate yet. Still safe to re-run — rows OMDb has no
  // certificate for simply stay null and get picked up again, so prefer running
  // it once and accepting the misses over fighting the daily quota.
  const certsOnly = process.argv.includes('--certs-only');

  const titles = certsOnly
    ? db
        .prepare(
          'SELECT * FROM titles WHERE imdb_id IS NOT NULL AND content_rating IS NULL ORDER BY title ASC'
        )
        .all()
    : db
        .prepare(
          'SELECT * FROM titles WHERE tmdb_id IS NOT NULL AND ratings_updated_at IS NULL ORDER BY title ASC'
        )
        .all();

  console.log(
    `\nFetching ${certsOnly ? 'age certificates' : 'ratings'} for ${titles.length} titles via OMDb...\n`
  );

  let success = 0,
    fail = 0;
  for (let i = 0; i < titles.length; i++) {
    const t = titles[i];
    process.stdout.write(`[${i + 1}/${titles.length}] `);
    try {
      const ok = await enrichTitle(t);
      if (ok) success++;
      else fail++;
    } catch (e) {
      console.log(`  ✗ Error for "${t.title}": ${e.message}`);
      fail++;
    }
    await sleep(120); // gentle; OMDb free tier is 1,000/day
  }

  console.log(`\n─────────────────────────────`);
  console.log(`Done: ${success} with ratings, ${fail} skipped`);
  db.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
