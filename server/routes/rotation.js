const express = require('express');
const router = express.Router();
const db = require('../db');

/**
 * Compute the current family rotation state from the database.
 * Checks for a skip override in settings, otherwise determines the next chooser
 * based on the most recent family_movie_night viewing.
 *
 * @param {Array<string>} rotation - Ordered list of family member names
 * @returns {{ nextChooser: string, rotation: string[], lastChooser: string|null, skipped: boolean }}
 */
function getRotationState(rotation) {
  const override = db.prepare("SELECT value FROM settings WHERE key = 'family_rotation_next_override'").get();
  const lastChooser = db.prepare(`
    SELECT vp.person
    FROM viewings v
    JOIN viewing_people vp ON v.id = vp.viewing_id
    WHERE v.tags LIKE '%family_movie_night%'
    AND vp.role = 'chooser'
    AND v.date IS NOT NULL
    ORDER BY v.date DESC
    LIMIT 1
  `).get();

  let nextChooser;
  let skipped = false;
  if (override) {
    nextChooser = override.value;
    skipped = true;
  } else if (lastChooser) {
    const idx = rotation.indexOf(lastChooser.person);
    nextChooser = rotation[(idx + 1) % rotation.length];
  } else {
    nextChooser = rotation[0];
  }

  return { nextChooser, rotation, lastChooser: lastChooser?.person || null, skipped };
}

/**
 * GET /api/family-rotation
 *
 * Returns the current rotation state: who chose last, who chooses next,
 * the full rotation order, and whether a skip override is active.
 */
router.get('/', (req, res) => {
  const rotation = req.app.locals.familyConfig.rotation;
  res.json(getRotationState(rotation));
});

/**
 * POST /api/family-rotation/skip
 *
 * Skips the current person's turn in the rotation, advancing to the next person.
 * Stores the override in the settings table.
 */
router.post('/skip', (req, res) => {
  const rotation = req.app.locals.familyConfig.rotation;
  const { nextChooser } = getRotationState(rotation);
  const idx = rotation.indexOf(nextChooser);
  const skippedTo = rotation[(idx + 1) % rotation.length];
  db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('family_rotation_next_override', ?, CURRENT_TIMESTAMP)").run(skippedTo);
  res.json(getRotationState(rotation));
});

/**
 * DELETE /api/family-rotation/skip
 *
 * Clears any skip override, restoring normal rotation.
 * Called automatically when a family viewing is logged.
 */
router.delete('/skip', (req, res) => {
  db.prepare("DELETE FROM settings WHERE key = 'family_rotation_next_override'").run();
  const rotation = req.app.locals.familyConfig.rotation;
  res.json(getRotationState(rotation));
});

module.exports = router;
