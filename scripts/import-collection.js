#!/usr/bin/env node
/**
 * Bulk import DVD/Blu-ray collection from shelf photo inventory.
 * Run: node scripts/import-collection.js
 */

const db = require('../server/db');

// Titles read from shelf photos (6 photos: 1 overview + 5 close-ups)
// Format: [searchTitle, format, notes]
// format: 'dvd' | 'bluray'
// We search DB by title (case-insensitive LIKE match)

const SHELF_TITLES = [
  // === TOP SHELF (left to right, from DVDs 1, 5, overview) ===
  ['Sling Blade', 'dvd', null],
  ['Zoolander', 'dvd', null],
  ['Bubba Ho-Tep', 'dvd', null],
  ['Ed Wood', 'dvd', null],
  ['Kung Pow', 'dvd', null],                    // Kung Pow: Enter the Fist
  ['Gallipoli', 'dvd', null],
  ['Trainspotting', 'dvd', null],
  ['Bourne Ultimatum', 'bluray', null],
  ['A History of Britain', 'dvd', 'BBC documentary'],
  ['Life', 'dvd', 'BBC nature documentary'],     // David Attenborough
  ['League of Gentlemen', 'dvd', 'Complete series box set'],
  ['Raiders of the Lost Ark', 'dvd', null],      // Indiana Jones
  ['Twin Peaks', 'dvd', 'Definitive Gold Box Edition'],
  ['Blackadder', 'dvd', 'Complete collection'],
  ['The Office', 'dvd', 'UK version - complete series'],

  // === BOTTOM SHELF (left to right, from DVDs 3, 4, overview) ===
  ['Big Lebowski', 'dvd', null],
  ['Midnight Cowboy', 'dvd', null],
  ['Fight Club', 'dvd', null],
  ['The Shining', 'dvd', null],
  ['Citizen Kane', 'dvd', null],
  ['Titanic', 'dvd', null],
  ['2001: A Space Odyssey', 'dvd', null],
  ['Annie Hall', 'dvd', null],
  ['12 Monkeys', 'dvd', null],
  ['Gone with the Wind', 'dvd', null],
  ['Lord of the Rings', 'dvd', 'Motion Picture Trilogy box set'],
  ['Psycho', 'dvd', null],
  ['Minority Report', 'dvd', null],
  ['Matrix', 'bluray', null],
  ['Down by Law', 'dvd', null],
  ['Throne of Blood', 'dvd', null],
];

// Search DB for a title, trying multiple strategies
function findTitle(searchTerm) {
  // Exact match first
  let row = db.prepare("SELECT id, title FROM titles WHERE title = ? COLLATE NOCASE").get(searchTerm);
  if (row) return row;

  // Contains match
  row = db.prepare("SELECT id, title FROM titles WHERE title LIKE ? COLLATE NOCASE").get(`%${searchTerm}%`);
  if (row) return row;

  // Try without "The "
  const withoutThe = searchTerm.replace(/^The\s+/i, '');
  if (withoutThe !== searchTerm) {
    row = db.prepare("SELECT id, title FROM titles WHERE title LIKE ? COLLATE NOCASE").get(`%${withoutThe}%`);
    if (row) return row;
  }

  return null;
}

// Create a new title in the DB
function createTitle(title, type = 'movie') {
  const result = db.prepare(
    "INSERT INTO titles (title, type) VALUES (?, ?)"
  ).run(title, type);
  return { id: result.lastInsertRowid, title };
}

// Add to collection (skip if duplicate)
function addToCollection(titleId, format, notes) {
  try {
    db.prepare(
      "INSERT INTO collection (title_id, format, notes) VALUES (?, ?, ?)"
    ).run(titleId, format, notes);
    return true;
  } catch (e) {
    if (e.message.includes('UNIQUE')) return false; // already exists
    throw e;
  }
}

console.log('=== DVD/Blu-ray Collection Import ===\n');

const matched = [];
const created = [];
const skipped = [];

for (const [searchTerm, format, notes] of SHELF_TITLES) {
  let found = findTitle(searchTerm);

  if (found) {
    const added = addToCollection(found.id, format, notes);
    matched.push({ search: searchTerm, dbTitle: found.title, id: found.id, added });
    console.log(`  ✓ ${added ? 'Added' : 'Already'}: "${found.title}" (ID:${found.id}) as ${format.toUpperCase()}`);
  } else {
    // Determine type - TV shows vs movies
    const isShow = ['Twin Peaks', 'Blackadder', 'The Office', 'League of Gentlemen', 'Life', 'A History of Britain'].includes(searchTerm);
    const fullTitle = {
      'Kung Pow': 'Kung Pow: Enter the Fist',
      'Big Lebowski': 'The Big Lebowski',
      'Matrix': 'The Matrix',
      'Raiders of the Lost Ark': 'Raiders of the Lost Ark',
      'League of Gentlemen': 'The League of Gentlemen',
      'Down by Law': 'Down by Law',
      '12 Monkeys': '12 Monkeys',
      'Throne of Blood': 'Throne of Blood',
    }[searchTerm] || searchTerm;

    const newTitle = createTitle(fullTitle, isShow ? 'show' : 'movie');
    addToCollection(newTitle.id, format, notes);
    created.push({ search: searchTerm, dbTitle: newTitle.title, id: newTitle.id, format });
    console.log(`  + Created & added: "${newTitle.title}" (ID:${newTitle.id}) as ${format.toUpperCase()}`);
  }
}

console.log(`\n=== Summary ===`);
console.log(`Matched existing: ${matched.length} (${matched.filter(m => m.added).length} new, ${matched.filter(m => !m.added).length} already in collection)`);
console.log(`Created new:      ${created.length}`);
console.log(`Total collection: ${matched.length + created.length} titles`);

if (created.length > 0) {
  console.log(`\nNew title IDs to enrich with TMDB: ${created.map(c => c.id).join(', ')}`);
}

console.log('\n--- Titles I could NOT confidently read from the photos: ---');
console.log('  - Several Criterion Collection editions (DVDs 2 photo - dark/thin spines)');
console.log('  - Possible Harry Potter Blu-ray (visible but specific title unclear)');
console.log('  - 1-2 titles at far right of bottom shelf');
console.log('  - "Thumb Wars" parody short (skipped)');
console.log('  - "The Bodleian on DVD" (library documentary - skipped)');
