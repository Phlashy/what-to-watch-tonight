#!/usr/bin/env node
/**
 * Merge duplicate title rows (two rows for the same film, sharing a tmdb_id).
 *
 * Migration 006 does this automatically on startup and then adds a UNIQUE index
 * so duplicates can't reappear — so on a current database this script has
 * nothing to do. It stays because it's the only way to *preview* the merge:
 *
 *   node scripts/dedup-titles.js --dry-run    # report only, changes nothing
 *   node scripts/dedup-titles.js              # merge for real
 *
 * The actual merging lives in server/lib/merge-titles.js, shared with the
 * migration so both behave identically.
 */
'use strict';

require('dotenv').config();
const os = require('os');
const Database = require('better-sqlite3');
const { findDuplicateGroups, mergeDuplicateTitles } = require('../server/lib/merge-titles');

const dryRun = process.argv.includes('--dry-run');
const dbPath = (process.env.DB_PATH || '~/movie-night-data/movies.db').replace('~', os.homedir());
const db = new Database(dbPath, { readonly: dryRun });
db.pragma('journal_mode = WAL');
if (!dryRun) db.pragma('foreign_keys = ON');

const groups = findDuplicateGroups(db);

if (groups.length === 0) {
  console.log('No duplicate titles found. Database is clean.');
  process.exit(0);
}

console.log(`Found ${groups.length} duplicate group(s) in ${dbPath}:\n`);

if (dryRun) {
  // Show what each row is carrying so a merge can be sanity-checked before it
  // happens — a shared tmdb_id is occasionally a bad TMDB match rather than a
  // true duplicate, and those want fixing rather than merging.
  const detail = db.prepare(
    `SELECT id, title, year, type,
            (SELECT COUNT(*) FROM viewings   WHERE title_id = titles.id) AS viewings,
            (SELECT COUNT(*) FROM list_items WHERE title_id = titles.id) AS lists
       FROM titles WHERE id = ?`
  );
  for (const group of groups) {
    console.log(`  tmdb ${group.tmdb_id}`);
    for (const id of group.ids) {
      const r = detail.get(id);
      console.log(
        `    #${r.id}  ${r.title} (${r.year ?? '?'}, ${r.type}) — ` +
          `${r.viewings} viewing(s), ${r.lists} list(s)`
      );
    }
  }
  console.log('\nDry run — nothing changed. Re-run without --dry-run to merge.');
  process.exit(0);
}

const { titlesRemoved } = mergeDuplicateTitles(db, { log: (msg) => console.log(msg) });

console.log(`\nDone. Removed ${titlesRemoved} duplicate title row(s).`);
