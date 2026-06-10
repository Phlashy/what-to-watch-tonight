/**
 * 001 — initial schema. The SQL lives in 001_initial.sql (kept as the readable
 * source of the base schema). All statements use IF NOT EXISTS, so re-running
 * against an existing database is a safe no-op.
 */
const fs = require('fs');
const path = require('path');

const SQL = fs.readFileSync(path.join(__dirname, '001_initial.sql'), 'utf8');

module.exports = {
  up(db) {
    db.exec(SQL);
  },
  down(db) {
    // Drop in FK-safe order (children before parents).
    for (const table of [
      'shortlists',
      'settings',
      'people',
      'list_items',
      'lists',
      'viewing_people',
      'viewings',
      'titles',
    ]) {
      db.exec(`DROP TABLE IF EXISTS ${table}`);
    }
  },
};
