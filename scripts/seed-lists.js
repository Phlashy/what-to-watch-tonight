#!/usr/bin/env node
/**
 * Seed lists + titles from a JSON file. Idempotent: re-running never
 * duplicates lists, titles, or list items.
 *
 * Usage: node scripts/seed-lists.js seed-data/montreal/starter.json
 *
 * Respects DB_PATH from .env (falls back to ~/movie-night-data/movies.db,
 * same as the server). Opening the database runs any pending migrations, so
 * this works on a brand-new empty database. Titles are inserted bare —
 * run `npm run enrich` afterwards to fetch TMDB posters/metadata.
 *
 * File format:
 *   { "lists": [ { "name", "displayName", "description",
 *                  "items": [ { "title", "year", "type" } ] } ] }
 */
// No `override` here (unlike the server): an explicitly passed DB_PATH env var
// must beat .env, so you can seed a different database from this checkout.
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const path = require('path');

const seedFile = process.argv[2];
if (!seedFile) {
  console.error('Usage: node scripts/seed-lists.js <seed-file.json>');
  process.exit(1);
}

const seed = require(path.resolve(seedFile));
const db = require('../server/db'); // opens DB_PATH and runs migrations

const insertList = db.prepare(
  'INSERT OR IGNORE INTO lists (name, display_name, description) VALUES (?, ?, ?)'
);
const getList = db.prepare('SELECT id FROM lists WHERE name = ?');
const findTitle = db.prepare(
  'SELECT id FROM titles WHERE lower(title) = lower(?) AND type = ? AND (year = ? OR year IS NULL OR ? IS NULL)'
);
const insertTitle = db.prepare('INSERT INTO titles (title, type, year) VALUES (?, ?, ?)');
const insertItem = db.prepare(
  "INSERT OR IGNORE INTO list_items (list_id, title_id, source) VALUES (?, ?, 'seed')"
);

let newTitles = 0;
let newItems = 0;

const run = db.transaction(() => {
  for (const list of seed.lists) {
    insertList.run(list.name, list.displayName || list.name, list.description || null);
    const listId = getList.get(list.name).id;

    for (const item of list.items || []) {
      const type = item.type || 'movie';
      let title = findTitle.get(item.title, type, item.year ?? null, item.year ?? null);
      if (!title) {
        title = { id: insertTitle.run(item.title, type, item.year ?? null).lastInsertRowid };
        newTitles++;
      }
      const result = insertItem.run(listId, title.id);
      newItems += result.changes;
    }
    console.log(`  ✓ ${list.displayName || list.name} (${(list.items || []).length} items)`);
  }
});

console.log(`\nSeeding from ${seedFile}...`);
run();
console.log(`\nDone: ${newTitles} new titles, ${newItems} new list items.`);
console.log('Next: npm run enrich   (fetches TMDB posters/metadata)\n');
