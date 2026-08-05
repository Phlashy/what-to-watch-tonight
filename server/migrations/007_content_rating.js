/**
 * 007 — the age certificate (G / PG / PG-13 / R, and TV-14 / TV-MA for shows).
 *
 * US MPAA/TV ratings, because OMDb already returns them in the `Rated` field of
 * the same response the nightly ratings job fetches for Rotten Tomatoes, IMDb and
 * Metacritic — so this costs no extra API calls. (TMDB can give BBFC or Canadian
 * certificates instead, but each needs its own per-title request.)
 *
 * Populated by scripts/enrich-ratings.js alongside the scores; existing titles are
 * back-filled with `npm run enrich:ratings -- --certs-only`, which targets rows
 * that already have scores but no certificate.
 */
module.exports = {
  up(db) {
    try {
      db.exec('ALTER TABLE titles ADD COLUMN content_rating TEXT');
    } catch (e) {
      if (!/duplicate column name/i.test(e.message)) throw e;
    }
  },

  down(db) {
    try {
      db.exec('ALTER TABLE titles DROP COLUMN content_rating');
    } catch {
      /* best effort */
    }
  },
};
