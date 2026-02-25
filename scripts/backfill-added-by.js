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

const seedData = require('../seed-data/final_consolidated.json');
const toWatch = seedData.to_watch || [];

// Build caches
const listIdCache = new Map(
  db.prepare('SELECT id, name FROM lists').all().map(r => [r.name, r.id])
);
const titleCache = new Map(
  db.prepare('SELECT id, title FROM titles').all().map(r => [r.title.trim().toLowerCase(), r.id])
);

function getTitleId(t) {
  return titleCache.get(t.trim().toLowerCase()) || null;
}

const update = db.prepare(
  'UPDATE list_items SET added_by = ? WHERE list_id = ? AND title_id = ? AND added_by IS NULL'
);

let updated = 0;
let skipped = 0;

const backfill = db.transaction(() => {
  for (const entry of toWatch) {
    if (!entry.for) { skipped++; continue; }

    const listId = listIdCache.get(entry.list);
    const titleId = getTitleId(entry.title);

    if (!listId || !titleId) { skipped++; continue; }

    const result = update.run(entry.for, listId, titleId);
    if (result.changes > 0) {
      updated++;
    }
  }
});

backfill();

console.log(`Backfilled added_by on ${updated} list items (${skipped} skipped — no match or already set).`);

// Show a sample of what was set
const sample = db.prepare(`
  SELECT t.title, l.name as list_name, li.added_by
  FROM list_items li
  JOIN titles t ON li.title_id = t.id
  JOIN lists l ON li.list_id = l.id
  WHERE li.added_by IS NOT NULL
  ORDER BY li.added_by, t.title
  LIMIT 20
`).all();

console.log('\nSample of attributed items:');
sample.forEach(r => console.log(`  [${r.added_by}] ${r.title} (${r.list_name})`));
