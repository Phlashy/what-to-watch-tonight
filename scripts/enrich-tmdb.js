#!/usr/bin/env node
/**
 * TMDB Enrichment Script
 * Fetches metadata for all titles that haven't been enriched yet.
 * Run: npm run enrich
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');

function expandPath(p) { return p.replace(/^~/, os.homedir()); }

const API_KEY = process.env.TMDB_API_KEY;
const DB_PATH = expandPath(process.env.DB_PATH || path.join(os.homedir(), 'movie-night-data', 'movies.db'));
const TMDB_BASE = 'https://api.themoviedb.org/3';

if (!API_KEY) { console.error('TMDB_API_KEY not set in .env'); process.exit(1); }

const db = new Database(DB_PATH);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function tmdbFetch(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TMDB ${res.status}: ${url}`);
  return res.json();
}

async function searchTitle(title, type, year) {
  const endpoint = type === 'show' ? 'tv' : 'movie';
  const params = new URLSearchParams({ api_key: API_KEY, query: title });
  if (year) params.set('year', year);
  const data = await tmdbFetch(`${TMDB_BASE}/search/${endpoint}?${params}`);
  return data.results || [];
}

async function getDetails(tmdbId, type) {
  const endpoint = type === 'show' ? 'tv' : 'movie';
  return tmdbFetch(`${TMDB_BASE}/${endpoint}/${tmdbId}?api_key=${API_KEY}&append_to_response=credits`);
}

const updateTitle = db.prepare(`
  UPDATE titles SET
    tmdb_id = ?, year = ?, director = ?, cast = ?, genre = ?,
    runtime_minutes = ?, poster_url = ?, synopsis = ?,
    updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`);

async function enrichTitle(row) {
  const results = await searchTitle(row.title, row.type, row.year);
  if (!results.length) {
    console.log(`  ✗ No results: "${row.title}"`);
    return false;
  }

  // Try exact match first, fall back to first result
  const exactMatch = results.find(r => {
    const name = (r.title || r.name || '').toLowerCase();
    return name === row.title.toLowerCase();
  });
  const match = exactMatch || results[0];

  let details;
  try {
    details = await getDetails(match.id, row.type);
  } catch (e) {
    console.log(`  ✗ Details failed for "${row.title}": ${e.message}`);
    return false;
  }

  const director = details.credits?.crew?.find(c => c.job === 'Director')?.name || null;
  const cast = JSON.stringify(details.credits?.cast?.slice(0, 5).map(c => c.name) || []);
  const genres = JSON.stringify(details.genres?.map(g => g.name) || []);
  const runtime = details.runtime || (details.episode_run_time?.[0]) || null;
  const posterUrl = match.poster_path ? `https://image.tmdb.org/t/p/w500${match.poster_path}` : null;
  const synopsis = match.overview || null;
  const yearStr = (match.release_date || match.first_air_date || '').split('-')[0];
  const year = yearStr ? parseInt(yearStr) : null;

  updateTitle.run(match.id, year, director, cast, genres, runtime, posterUrl, synopsis, row.id);
  const matchedName = match.title || match.name;
  const marker = matchedName.toLowerCase() === row.title.toLowerCase() ? '✓' : '~';
  console.log(`  ${marker} "${row.title}" → "${matchedName}" (${year || '?'})`);
  return true;
}

async function main() {
  const titles = db.prepare('SELECT * FROM titles WHERE tmdb_id IS NULL ORDER BY title ASC').all();
  console.log(`\nEnriching ${titles.length} titles from TMDB...\n`);

  let success = 0, fail = 0;
  for (let i = 0; i < titles.length; i++) {
    const t = titles[i];
    process.stdout.write(`[${i + 1}/${titles.length}] `);
    try {
      const ok = await enrichTitle(t);
      if (ok) success++; else fail++;
    } catch (e) {
      console.log(`  ✗ Error for "${t.title}": ${e.message}`);
      fail++;
    }
    await sleep(150); // ~6 req/sec, well within TMDB limits
  }

  console.log(`\n─────────────────────────────`);
  console.log(`Done: ${success} enriched, ${fail} not found`);
  db.close();
}

main().catch(e => { console.error(e); process.exit(1); });
