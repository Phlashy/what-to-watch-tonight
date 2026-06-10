/**
 * Family movie-night rotation — the single source of truth.
 *
 * Rotation state is stored as the *next* chooser's name in the `settings` table
 * (key `family_rotation_next`). It advances by one step whenever a
 * family_movie_night viewing is logged — the "tough luck" rule: rotation moves
 * on regardless of who actually chose the movie.
 *
 * Both the `/api/family-rotation` route and the chat assistant's
 * get_family_rotation tool read rotation through these functions, so the two
 * surfaces can never disagree about whose turn it is.
 *
 * Every function takes the `db` handle as its first argument so the logic can be
 * unit-tested against an in-memory database.
 */

const NEXT_KEY = 'family_rotation_next';

/**
 * The person whose turn it is to choose next.
 * @param {import('better-sqlite3').Database} db
 * @param {string[]} rotation - ordered chooser names (e.g. ['Davin','Arianne',…])
 * @returns {string}
 */
function getNextChooser(db, rotation) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(NEXT_KEY);
  return row?.value || rotation[0];
}

/**
 * Persist a new "next chooser" value.
 * @param {import('better-sqlite3').Database} db
 * @param {string} name
 */
function setNextChooser(db, name) {
  db.prepare(
    'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)'
  ).run(NEXT_KEY, name);
}

/**
 * Advance the rotation by one step and persist.
 * @returns {string} the new next chooser
 */
function advanceRotation(db, rotation) {
  const idx = rotation.indexOf(getNextChooser(db, rotation));
  const next = rotation[(idx + 1) % rotation.length];
  setNextChooser(db, next);
  return next;
}

/**
 * Rewind the rotation by one step (undo a skip) and persist.
 * @returns {string} the new next chooser
 */
function rewindRotation(db, rotation) {
  const idx = rotation.indexOf(getNextChooser(db, rotation));
  const prev = rotation[(idx - 1 + rotation.length) % rotation.length];
  setNextChooser(db, prev);
  return prev;
}

/**
 * Full rotation state for display.
 * @returns {{ nextChooser: string, rotation: string[], lastChooser: string }}
 */
function getRotationState(db, rotation) {
  const nextChooser = getNextChooser(db, rotation);
  const idx = rotation.indexOf(nextChooser);
  const lastChooser = rotation[(idx - 1 + rotation.length) % rotation.length];
  return { nextChooser, rotation, lastChooser };
}

module.exports = {
  NEXT_KEY,
  getNextChooser,
  setNextChooser,
  advanceRotation,
  rewindRotation,
  getRotationState,
};
