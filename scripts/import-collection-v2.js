#!/usr/bin/env node
/**
 * Import the remaining DVD/Blu-ray titles that were missed in v1.
 * Also removes the incorrectly-identified Indiana Jones entry.
 */
require('dotenv').config();
const db = require('../server/db');
const API_KEY = process.env.TMDB_API_KEY;

// === Fix: Remove Indiana Jones — it's not actually on the shelf ===
const indy = db.prepare("SELECT id FROM collection WHERE title_id = 250").get();
if (indy) {
  db.prepare("DELETE FROM collection WHERE id = ?").run(indy.id);
  console.log("Removed: Indiana Jones (not on shelf)\n");
}

// === Fix: Update notes on existing entries ===
db.prepare("UPDATE collection SET notes = 'The Ultimate Edition + standalone Goes Forth' WHERE title_id = 560 AND format = 'dvd'").run();
db.prepare("UPDATE collection SET notes = 'Special Collector''s Edition + Standard Edition (2 copies)' WHERE title_id = (SELECT id FROM titles WHERE title LIKE '%Trainspotting%' LIMIT 1) AND format = 'dvd'").run();
console.log("Updated notes for Blackadder and Trainspotting\n");

// === Titles already in DB that just need a collection entry ===
const EXISTING_DB = [
  [6,   'dvd',    null],                          // Ghost Dog
  [153, 'dvd',    null],                          // Little Women
  [555, 'bluray', null],                          // The Bourne Identity
  [87,  'dvd',    'The Coppola Restoration'],     // The Godfather
  [217, 'bluray', null],                          // Harry Potter Half-Blood Prince
  [212, 'bluray', null],                          // Harry Potter Deathly Hallows Pt 1
  [301, 'dvd',    'Criterion Collection'],        // The Princess Bride
  [129, 'dvd',    'Criterion Collection'],        // Time Bandits
];

console.log("=== Adding existing DB titles to collection ===");
for (const [titleId, format, notes] of EXISTING_DB) {
  try {
    db.prepare("INSERT INTO collection (title_id, format, notes) VALUES (?, ?, ?)").run(titleId, format, notes);
    const t = db.prepare("SELECT title FROM titles WHERE id = ?").get(titleId);
    console.log(`  + ${t.title} (ID:${titleId}) as ${format.toUpperCase()}`);
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      console.log(`  = Already: title_id ${titleId}`);
    } else throw e;
  }
}

// === New titles to create, add to collection, then enrich ===
// [title, type, format, notes, tmdbSearchOverride]
const NEW_TITLES = [
  // Top shelf missed
  ['A Bit of Fry & Laurie',           'show',  'dvd',    null, null],
  ['Heavenly Creatures',               'movie', 'dvd',    null, null],
  ['Thumb Wars: The Phantom Cuticle',  'movie', 'dvd',    null, 'Thumb Wars'],
  ['The Bourne Supremacy',             'movie', 'bluray', null, null],
  ['The World at War',                 'show',  'dvd',    '5-Volume Box Set', null],
  ['Band of Brothers',                 'show',  'dvd',    'Metal Tin Edition', null],
  ['Space Ghost Coast to Coast',       'show',  'dvd',    'Volume One', null],
  ['Flight of the Conchords',          'show',  'dvd',    'Complete First Season', null],
  ['First Strokes',                    'movie', 'dvd',    'Swimming instructional', null],
  ['The Bodhrán: Beginners Guide',     'movie', 'dvd',    'Instructional DVD', null],

  // Bottom shelf missed
  ['Dr. Strangelove',                  'movie', 'dvd',    null, null],
  ['Donnie Darko',                     'movie', 'dvd',    null, null],
  ['Team America: World Police',       'movie', 'dvd',    null, null],
  ['Napoleon Dynamite',                'movie', 'dvd',    null, null],
  ['The Fly',                          'movie', 'dvd',    null, 'The Fly 1986'],
  ['Lawrence of Arabia',               'movie', 'dvd',    null, null],
  ['Reservoir Dogs',                   'movie', 'dvd',    null, null],
  ['Se7en',                            'movie', 'dvd',    null, null],
  ['Batman',                           'movie', 'bluray', 'Batman / Batman Returns double', 'Batman 1989'],
  ['Batman Returns',                   'movie', 'bluray', 'Batman / Batman Returns double', null],

  // Criterion Collection
  ['The Lady Vanishes',                'movie', 'dvd',    'Criterion Collection', null],
  ['Rashomon',                         'movie', 'dvd',    'Criterion Collection', null],
  ['Seven Samurai',                    'movie', 'dvd',    'Criterion Collection', null],
  ['Armageddon',                       'movie', 'dvd',    'Criterion Collection', null],
  ['The Last Temptation of Christ',    'movie', 'dvd',    'Criterion Collection', null],
  ['The Life Aquatic with Steve Zissou','movie','dvd',    'Criterion Collection', null],
  ['RoboCop',                          'movie', 'dvd',    'Criterion Collection', null],
  ['Bob le Flambeur',                  'movie', 'dvd',    'Criterion Collection', null],
  ['Overlord',                         'movie', 'dvd',    'Criterion Collection', 'Overlord 1975'],
  ['Night and Fog',                    'movie', 'dvd',    'Criterion Collection', 'Nuit et brouillard'],
  ['Brazil',                           'movie', 'dvd',    'Criterion Collection, 3-Disc Box Set', null],
];

async function enrichTitle(id, title, type, searchOverride) {
  const tmdbType = type === 'show' ? 'tv' : 'movie';
  const query = searchOverride || title;
  const url = `https://api.themoviedb.org/3/search/${tmdbType}?api_key=${API_KEY}&query=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!data.results || data.results.length === 0) return false;

  const match = data.results[0];
  const detailRes = await fetch(`https://api.themoviedb.org/3/${tmdbType}/${match.id}?api_key=${API_KEY}&append_to_response=credits`);
  const d = await detailRes.json();

  const poster = d.poster_path ? `https://image.tmdb.org/t/p/w500${d.poster_path}` : null;
  const year = (d.release_date || d.first_air_date || '').substring(0, 4) || null;
  const genres = (d.genres || []).map(g => g.name);
  let director = null;
  if (type === 'movie' && d.credits && d.credits.crew) {
    const dir = d.credits.crew.find(c => c.job === 'Director');
    if (dir) director = dir.name;
  } else if (d.created_by && d.created_by.length) {
    director = d.created_by.map(c => c.name).join(', ');
  }
  const cast = ((d.credits && d.credits.cast) || []).slice(0, 10).map(c => c.name);

  db.prepare(`
    UPDATE titles SET tmdb_id=?, poster_url=?, year=?, synopsis=?,
      runtime_minutes=?, genre=?, director=?, cast=?
    WHERE id=?
  `).run(match.id, poster, year ? parseInt(year) : null, d.overview,
    d.runtime || null, JSON.stringify(genres), director, JSON.stringify(cast), id);

  return { year, director };
}

async function main() {
  console.log("\n=== Creating and importing new titles ===");

  for (const [title, type, format, notes, searchOverride] of NEW_TITLES) {
    // Create title
    const result = db.prepare("INSERT INTO titles (title, type) VALUES (?, ?)").run(title, type);
    const titleId = result.lastInsertRowid;

    // Add to collection
    db.prepare("INSERT INTO collection (title_id, format, notes) VALUES (?, ?, ?)").run(titleId, format, notes);

    // Enrich with TMDB
    try {
      const info = await enrichTitle(titleId, title, type, searchOverride);
      if (info) {
        console.log(`  ✓ ${title} (${info.year || '?'}) — ${info.director || 'no director'} [${format.toUpperCase()}]`);
      } else {
        console.log(`  ✗ ${title} — no TMDB match [${format.toUpperCase()}]`);
      }
    } catch (e) {
      console.log(`  ✗ ${title} — error: ${e.message}`);
    }

    await new Promise(r => setTimeout(r, 300));
  }

  // Final count
  const count = db.prepare("SELECT COUNT(*) as n FROM collection").get();
  const dvds = db.prepare("SELECT COUNT(*) as n FROM collection WHERE format='dvd'").get();
  const blurays = db.prepare("SELECT COUNT(*) as n FROM collection WHERE format='bluray'").get();
  console.log(`\n=== Collection total: ${count.n} entries (${dvds.n} DVD, ${blurays.n} Blu-ray) ===`);
}

main();
