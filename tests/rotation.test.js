const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createTestDb, seedTestData } = require('./helpers');

const ROTATION = ['Davin', 'Arianne', 'Nupur', 'Gordon'];

/**
 * Mirrors server/index.js getRotationState() logic.
 */
function getRotationState(db) {
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
    const idx = ROTATION.indexOf(lastChooser.person);
    nextChooser = ROTATION[(idx + 1) % ROTATION.length];
  } else {
    nextChooser = ROTATION[0];
  }

  return { nextChooser, rotation: ROTATION, lastChooser: lastChooser?.person || null, skipped };
}

describe('Family Rotation', () => {
  let db, ids;

  before(() => {
    db = createTestDb();
    ids = seedTestData(db);
  });

  beforeEach(() => {
    // Clean up viewings and settings before each test for isolation
    db.prepare('DELETE FROM viewing_people').run();
    db.prepare('DELETE FROM viewings').run();
    db.prepare('DELETE FROM settings').run();
  });

  it('defaults to first person in rotation when no viewings exist', () => {
    const state = getRotationState(db);
    assert.equal(state.nextChooser, 'Davin');
    assert.equal(state.lastChooser, null);
    assert.equal(state.skipped, false);
  });

  it('advances to next person after a family movie night viewing', () => {
    // Davin chose last time
    const v = db.prepare(
      "INSERT INTO viewings (title_id, date, tags) VALUES (?, '2025-03-01', ?)"
    ).run(ids.titles.princessBride, JSON.stringify(['family_movie_night']));
    db.prepare("INSERT INTO viewing_people (viewing_id, person, role) VALUES (?, 'Davin', 'chooser')").run(v.lastInsertRowid);

    const state = getRotationState(db);
    assert.equal(state.lastChooser, 'Davin');
    assert.equal(state.nextChooser, 'Arianne'); // Davin → Arianne
  });

  it('wraps around from last person to first', () => {
    // Gordon (last in rotation) chose
    const v = db.prepare(
      "INSERT INTO viewings (title_id, date, tags) VALUES (?, '2025-03-15', ?)"
    ).run(ids.titles.spiritedAway, JSON.stringify(['family_movie_night']));
    db.prepare("INSERT INTO viewing_people (viewing_id, person, role) VALUES (?, 'Gordon', 'chooser')").run(v.lastInsertRowid);

    const state = getRotationState(db);
    assert.equal(state.nextChooser, 'Davin'); // Gordon → Davin (wraps)
  });

  it('uses the most recent family_movie_night viewing to determine last chooser', () => {
    // Two viewings: Davin first, then Nupur more recently
    const v1 = db.prepare("INSERT INTO viewings (title_id, date, tags) VALUES (?, '2025-01-01', ?)").run(
      ids.titles.princessBride, JSON.stringify(['family_movie_night'])
    );
    db.prepare("INSERT INTO viewing_people (viewing_id, person, role) VALUES (?, 'Davin', 'chooser')").run(v1.lastInsertRowid);

    const v2 = db.prepare("INSERT INTO viewings (title_id, date, tags) VALUES (?, '2025-03-01', ?)").run(
      ids.titles.spiritedAway, JSON.stringify(['family_movie_night'])
    );
    db.prepare("INSERT INTO viewing_people (viewing_id, person, role) VALUES (?, 'Nupur', 'chooser')").run(v2.lastInsertRowid);

    const state = getRotationState(db);
    assert.equal(state.lastChooser, 'Nupur');
    assert.equal(state.nextChooser, 'Gordon'); // Nupur → Gordon
  });

  describe('skip override', () => {
    it('overrides rotation when skip is set', () => {
      // Davin chose last
      const v = db.prepare("INSERT INTO viewings (title_id, date, tags) VALUES (?, '2025-03-01', ?)").run(
        ids.titles.princessBride, JSON.stringify(['family_movie_night'])
      );
      db.prepare("INSERT INTO viewing_people (viewing_id, person, role) VALUES (?, 'Davin', 'chooser')").run(v.lastInsertRowid);

      // Next would be Arianne, but we skip to Nupur
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('family_rotation_next_override', 'Nupur')").run();

      const state = getRotationState(db);
      assert.equal(state.nextChooser, 'Nupur');
      assert.equal(state.skipped, true);
    });

    it('clears override when family_movie_night viewing is logged', () => {
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('family_rotation_next_override', 'Gordon')").run();

      // Simulate logging a family movie night (as viewings.js POST does)
      db.prepare("DELETE FROM settings WHERE key = 'family_rotation_next_override'").run();

      const override = db.prepare("SELECT * FROM settings WHERE key = 'family_rotation_next_override'").get();
      assert.equal(override, undefined);
    });
  });

  describe('ignores non-family viewings', () => {
    it('does not count viewings without family_movie_night tag', () => {
      const v = db.prepare(
        "INSERT INTO viewings (title_id, date, tags) VALUES (?, '2025-03-28', '[]')"
      ).run(ids.titles.breakingBad);
      db.prepare("INSERT INTO viewing_people (viewing_id, person, role) VALUES (?, 'Gordon', 'chooser')").run(v.lastInsertRowid);

      const state = getRotationState(db);
      assert.equal(state.lastChooser, null); // no family_movie_night tag
      assert.equal(state.nextChooser, 'Davin');
    });
  });
});
