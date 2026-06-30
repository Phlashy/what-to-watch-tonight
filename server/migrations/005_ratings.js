/**
 * 005 — external critic/audience ratings on titles.
 *
 * Stores the IMDb id (looked up from TMDB) plus the three scores OMDb returns in
 * a single call: Rotten Tomatoes (Tomatometer %), IMDb (x/10), and Metacritic
 * (Metascore /100). Populated by scripts/enrich-ratings.js (`npm run enrich:ratings`).
 * Only the RT score is surfaced in the UI for now; the other two are stored so a
 * future display change doesn't require re-backfilling from OMDb.
 */
module.exports = {
  up(db) {
    const addColumn = (table, col, type) => {
      try {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
      } catch (e) {
        if (!/duplicate column name/i.test(e.message)) throw e;
      }
    };

    addColumn('titles', 'imdb_id', 'TEXT');
    addColumn('titles', 'rt_score', 'INTEGER'); // Tomatometer, 0-100
    addColumn('titles', 'imdb_rating', 'REAL'); // out of 10
    addColumn('titles', 'metacritic_score', 'INTEGER'); // Metascore, 0-100
    addColumn('titles', 'ratings_updated_at', 'TEXT');
  },

  down(db) {
    for (const col of [
      'ratings_updated_at',
      'metacritic_score',
      'imdb_rating',
      'rt_score',
      'imdb_id',
    ]) {
      try {
        db.exec(`ALTER TABLE titles DROP COLUMN ${col}`);
      } catch {
        /* best effort */
      }
    }
  },
};
