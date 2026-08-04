/**
 * 006 — one title row per TMDB id.
 *
 * Every "add a title" path used to INSERT unconditionally, so adding a film the
 * library already had created a second row rather than reusing the first. By
 * 2026-08 production had 24 such pairs (Weapons was even on the same list twice,
 * once under each id).
 *
 * The fix is a UNIQUE index on tmdb_id — but it can't be created while the
 * duplicates exist, so this migration merges them first (see
 * server/lib/merge-titles.js, which folds every viewing, list membership, star,
 * disc and show-status onto the surviving row). Both steps run in one
 * transaction: either the database ends up clean and constrained, or unchanged.
 *
 * The index is partial — `WHERE tmdb_id IS NOT NULL` — because plenty of titles
 * have no TMDB match yet, and SQLite treats every NULL as distinct in a UNIQUE
 * index anyway. Being explicit documents the intent and keeps the index small.
 */
const { mergeDuplicateTitles } = require('../lib/merge-titles');

module.exports = {
  up(db) {
    const { groups, titlesRemoved } = mergeDuplicateTitles(db);
    if (groups > 0) {
      console.log(
        `[migration 006] merged ${groups} duplicate title group(s), removed ${titlesRemoved} row(s)`
      );
    }

    db.exec(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_titles_tmdb_id_unique
         ON titles(tmdb_id) WHERE tmdb_id IS NOT NULL`
    );
  },

  down(db) {
    // Only the index is reversible — merged rows are gone for good.
    db.exec('DROP INDEX IF EXISTS idx_titles_tmdb_id_unique');
  },
};
