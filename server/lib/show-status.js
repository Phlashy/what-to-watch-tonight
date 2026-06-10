/**
 * Show-status helpers.
 *
 * `db` is passed in so the logic is unit-testable against an in-memory database.
 */

/**
 * Should a show be auto-removed from to-watch lists?
 *
 * Yes only when **nobody is still actively engaged** — i.e. no person has a
 * 'wishlist' or 'watching' status for it. This is what stops one person marking
 * a show finished/dropped from yanking it off shared lists while others are
 * still mid-watch or still want to see it. The show comes off the lists only
 * once the last engaged person finishes or drops it.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {number} titleId
 * @returns {boolean}
 */
function noOneStillEngaged(db, titleId) {
  const { n } = db
    .prepare(
      "SELECT COUNT(*) n FROM show_status WHERE title_id = ? AND status IN ('wishlist', 'watching')"
    )
    .get(titleId);
  return n === 0;
}

module.exports = { noOneStillEngaged };
