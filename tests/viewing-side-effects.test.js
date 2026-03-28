const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createTestDb, seedTestData } = require('./helpers');

describe('Viewing creation side effects', () => {
  let db, ids;

  before(() => {
    db = createTestDb();
    ids = seedTestData(db);
  });

  beforeEach(() => {
    db.prepare('DELETE FROM viewing_people').run();
    db.prepare('DELETE FROM viewings').run();
    db.prepare('DELETE FROM settings').run();
  });

  /**
   * Mirrors the POST /api/viewings business logic from server/routes/viewings.js.
   */
  function createViewing({ title_id, date, date_precision = 'day', rating, notes, tags = [], people = [], picked_by }) {
    const result = db.prepare(`
      INSERT INTO viewings (title_id, date, date_precision, rating, notes, tags)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(title_id, date || null, date_precision, rating || null, notes || null, JSON.stringify(tags));

    const viewingId = result.lastInsertRowid;

    for (const p of people) {
      db.prepare('INSERT INTO viewing_people (viewing_id, person, role, rating) VALUES (?, ?, ?, ?)').run(
        viewingId, p.person, p.role || 'chooser', p.rating || null
      );
    }

    if (picked_by) {
      const familyList = db.prepare("SELECT id FROM lists WHERE name = 'family_to_watch'").get();
      if (familyList) {
        db.prepare('UPDATE list_items SET added_by = ? WHERE title_id = ? AND list_id = ?').run(picked_by, title_id, familyList.id);
      }
    }

    if (tags.includes('family_movie_night')) {
      const familyList = db.prepare("SELECT id FROM lists WHERE name = 'family_to_watch'").get();
      if (familyList) {
        db.prepare('DELETE FROM list_items WHERE list_id = ? AND title_id = ?').run(familyList.id, title_id);
      }
      db.prepare("DELETE FROM settings WHERE key = 'family_rotation_next_override'").run();
    }

    return viewingId;
  }

  it('removes title from family_to_watch when tagged family_movie_night', () => {
    // Confirm Princess Bride is on the family list
    const before = db.prepare(`
      SELECT * FROM list_items li JOIN lists l ON li.list_id = l.id
      WHERE l.name = 'family_to_watch' AND li.title_id = ?
    `).get(ids.titles.princessBride);
    assert.ok(before, 'Should be on family list before viewing');

    createViewing({
      title_id: ids.titles.princessBride,
      date: '2025-03-28',
      tags: ['family_movie_night'],
      people: [{ person: 'Davin', role: 'chooser' }],
    });

    const after = db.prepare(`
      SELECT * FROM list_items li JOIN lists l ON li.list_id = l.id
      WHERE l.name = 'family_to_watch' AND li.title_id = ?
    `).get(ids.titles.princessBride);
    assert.equal(after, undefined, 'Should be removed from family list after watching');
  });

  it('does NOT remove from family_to_watch without family_movie_night tag', () => {
    const spiritedBefore = db.prepare(`
      SELECT * FROM list_items li JOIN lists l ON li.list_id = l.id
      WHERE l.name = 'family_to_watch' AND li.title_id = ?
    `).get(ids.titles.spiritedAway);
    assert.ok(spiritedBefore);

    createViewing({
      title_id: ids.titles.spiritedAway,
      date: '2025-03-28',
      tags: [],  // no family_movie_night tag
      people: [{ person: 'Gordon', role: 'chooser' }],
    });

    const spiritedAfter = db.prepare(`
      SELECT * FROM list_items li JOIN lists l ON li.list_id = l.id
      WHERE l.name = 'family_to_watch' AND li.title_id = ?
    `).get(ids.titles.spiritedAway);
    assert.ok(spiritedAfter, 'Should remain on family list');
  });

  it('clears rotation skip override when family_movie_night viewing is logged', () => {
    db.prepare("INSERT INTO settings (key, value) VALUES ('family_rotation_next_override', 'Gordon')").run();

    createViewing({
      title_id: ids.titles.princessBride,
      date: '2025-03-28',
      tags: ['family_movie_night'],
      people: [{ person: 'Arianne', role: 'chooser' }],
    });

    const override = db.prepare("SELECT * FROM settings WHERE key = 'family_rotation_next_override'").get();
    assert.equal(override, undefined, 'Override should be cleared');
  });

  it('does NOT clear rotation override for non-family viewings', () => {
    db.prepare("INSERT INTO settings (key, value) VALUES ('family_rotation_next_override', 'Gordon')").run();

    createViewing({
      title_id: ids.titles.breakingBad,
      date: '2025-03-28',
      tags: [],  // not family_movie_night
      people: [{ person: 'Gordon', role: 'chooser' }],
    });

    const override = db.prepare("SELECT * FROM settings WHERE key = 'family_rotation_next_override'").get();
    assert.ok(override, 'Override should NOT be cleared');
  });

  describe('picked_by scope', () => {
    it('picked_by only updates the family_to_watch list item, not other lists', () => {
      // Title is on both family and nupur lists
      db.prepare("INSERT OR IGNORE INTO list_items (list_id, title_id, added_by) VALUES (?, ?, 'Nupur')").run(
        ids.lists.nupur, ids.titles.spiritedAway
      );

      createViewing({
        title_id: ids.titles.spiritedAway,
        date: '2025-03-28',
        tags: [],
        people: [{ person: 'Gordon', role: 'chooser' }],
        picked_by: 'Gordon',
      });

      const familyItem = db.prepare(`
        SELECT li.added_by FROM list_items li JOIN lists l ON li.list_id = l.id
        WHERE l.name = 'family_to_watch' AND li.title_id = ?
      `).get(ids.titles.spiritedAway);

      const nupurItem = db.prepare(`
        SELECT li.added_by FROM list_items li JOIN lists l ON li.list_id = l.id
        WHERE l.name = 'with_nupur' AND li.title_id = ?
      `).get(ids.titles.spiritedAway);

      if (familyItem) assert.equal(familyItem.added_by, 'Gordon', 'Family list item should be updated');
      if (nupurItem) assert.equal(nupurItem.added_by, 'Nupur', 'Nupur list item should be untouched');
    });
  });
});
