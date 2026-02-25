#!/usr/bin/env node
/**
 * Enrich newly-created collection titles with TMDB metadata.
 * Run: node scripts/enrich-collection.js
 */

require('dotenv').config();
const db = require('../server/db');

const API_KEY = process.env.TMDB_API_KEY;
if (!API_KEY) { console.error('TMDB_API_KEY not found in .env'); process.exit(1); }

async function enrichTitle(id, title, type) {
  const tmdbType = type === 'show' ? 'tv' : 'movie';
  const searchUrl = `https://api.themoviedb.org/3/search/${tmdbType}?api_key=${API_KEY}&query=${encodeURIComponent(title)}`;
  const res = await fetch(searchUrl);
  const data = await res.json();

  if (!data.results || data.results.length === 0) {
    console.log(`  ✗ No results for: ${title}`);
    return false;
  }

  const match = data.results[0];
  const tmdbId = match.id;

  // Fetch full details
  const detailUrl = `https://api.themoviedb.org/3/${tmdbType}/${tmdbId}?api_key=${API_KEY}&append_to_response=credits`;
  const detailRes = await fetch(detailUrl);
  const detail = await detailRes.json();

  const poster = detail.poster_path ? `https://image.tmdb.org/t/p/w500${detail.poster_path}` : null;
  const year = (detail.release_date || detail.first_air_date || '').substring(0, 4) || null;
  const synopsis = detail.overview || null;
  const runtime = detail.runtime || (detail.episode_run_time && detail.episode_run_time[0]) || null;
  const genres = (detail.genres || []).map(g => g.name);

  // Director (movies) or creators (shows)
  let director = null;
  if (type === 'movie' && detail.credits && detail.credits.crew) {
    const dir = detail.credits.crew.find(c => c.job === 'Director');
    if (dir) director = dir.name;
  } else if (detail.created_by && detail.created_by.length) {
    director = detail.created_by.map(c => c.name).join(', ');
  }

  // Top cast
  const cast = (detail.credits && detail.credits.cast || []).slice(0, 10).map(c => c.name);

  // Update DB — use the TMDB canonical title
  const canonicalTitle = detail.title || detail.name || title;
  db.prepare(`
    UPDATE titles SET
      tmdb_id = ?, poster_url = ?, year = ?, synopsis = ?,
      runtime_minutes = ?, genre = ?, director = ?, cast = ?,
      title = ?
    WHERE id = ?
  `).run(
    tmdbId, poster, year ? parseInt(year) : null, synopsis,
    runtime, JSON.stringify(genres), director, JSON.stringify(cast),
    canonicalTitle,
    id
  );

  console.log(`  ✓ ${canonicalTitle} (${year || '?'}) — ${director || 'no director'}${poster ? ' [poster]' : ''}`);
  return true;
}

async function main() {
  const titles = db.prepare(`
    SELECT t.id, t.title, t.type
    FROM titles t
    JOIN collection c ON c.title_id = t.id
    WHERE t.tmdb_id IS NULL
    ORDER BY t.id
  `).all();

  console.log(`Enriching ${titles.length} titles with TMDB data...\n`);

  let success = 0, fail = 0;
  for (const t of titles) {
    try {
      const ok = await enrichTitle(t.id, t.title, t.type);
      if (ok) success++; else fail++;
    } catch (e) {
      console.log(`  ✗ Error for ${t.title}: ${e.message}`);
      fail++;
    }
    // Rate limit — be nice to the API
    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`\nDone: ${success} enriched, ${fail} failed`);
}

main();
