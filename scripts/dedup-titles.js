#!/usr/bin/env node
'use strict';

require('dotenv').config();
const path = require('path');
const os = require('os');
const Database = require('better-sqlite3');

const dbPath = (process.env.DB_PATH || '~/movie-night-data/movies.db').replace('~', os.homedir());
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Find all tmdb_id groups with more than one title
const groups = db.prepare(`
  SELECT tmdb_id, COUNT(*) as cnt, GROUP_CONCAT(id ORDER BY id) as ids
  FROM titles
  WHERE tmdb_id IS NOT NULL
  GROUP BY tmdb_id
  HAVING cnt > 1
  ORDER BY cnt DESC, tmdb_id
`).all();

if (groups.length === 0) {
  console.log('No duplicate titles found. Database is clean.');
  process.exit(0);
}

console.log(`Found ${groups.length} duplicate group(s) to merge:\n`);

const merge = db.transaction((group) => {
  const ids = group.ids.split(',').map(Number);

  // Pick canonical: most viewings first, then most list_items, then lowest id
  const placeholders = ids.join(',');
  const canonical = db.prepare(`
    SELECT t.id, t.title,
      (SELECT COUNT(*) FROM viewings WHERE title_id = t.id) as vc,
      (SELECT COUNT(*) FROM list_items WHERE title_id = t.id) as lc
    FROM titles t
    WHERE t.id IN (${placeholders})
    ORDER BY vc DESC, lc DESC, t.id ASC
    LIMIT 1
  `).get();

  const others = ids.filter(id => id !== canonical.id);
  let totalViewings = 0;
  let totalListItems = 0;

  for (const otherId of others) {
    const other = db.prepare('SELECT id, title FROM titles WHERE id = ?').get(otherId);
    const movedV = db.prepare('UPDATE viewings SET title_id = ? WHERE title_id = ?').run(canonical.id, otherId);
    const movedL = db.prepare('UPDATE list_items SET title_id = ? WHERE title_id = ?').run(canonical.id, otherId);
    db.prepare('DELETE FROM shortlists WHERE title_id = ?').run(otherId);
    db.prepare('DELETE FROM titles WHERE id = ?').run(otherId);

    totalViewings += movedV.changes;
    totalListItems += movedL.changes;

    console.log(`  Merged: "${other.title}" (id ${otherId}) → "${canonical.title}" (id ${canonical.id})`);
    if (movedV.changes > 0) console.log(`    Moved ${movedV.changes} viewing(s)`);
    if (movedL.changes > 0) console.log(`    Moved ${movedL.changes} list item(s)`);
  }

  return { canonical, totalViewings, totalListItems };
});

let mergedTitles = 0;
let mergedViewings = 0;
let mergedListItems = 0;

for (const group of groups) {
  const result = merge(group);
  mergedTitles += group.ids.split(',').length - 1;
  mergedViewings += result.totalViewings;
  mergedListItems += result.totalListItems;
  console.log();
}

console.log(`Done. Removed ${mergedTitles} duplicate title record(s), moved ${mergedViewings} viewing(s) and ${mergedListItems} list item(s).`);
