const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { createTestDb, seedTestData } = require('./helpers');

describe('What-to-Watch query', () => {
  let db, ids;

  before(() => {
    db = createTestDb();
    ids = seedTestData(db);
  });

  /**
   * Mirrors the core query from server/index.js GET /api/what-to-watch/:context.
   * Uses parameterized queries (the bug-fixed version) rather than string interpolation.
   */
  function whatToWatch(context, listNames) {
    const placeholders = listNames.map(() => '?').join(',');

    let query = `
      SELECT
        t.id, t.title, t.year, t.director, t.genre, t.runtime_minutes,
        t.poster_url, t.type, t.cast,
        li.id as list_item_id, li.streaming_service, li.note, li.added_at, li.added_by,
        l.name as list_name, l.display_name as list_display_name,
        (SELECT MAX(v.date) FROM viewings v WHERE v.title_id = t.id) as last_watched,
        (SELECT COUNT(*) FROM viewings v WHERE v.title_id = t.id) as view_count,
        (SELECT json_group_array(s.person) FROM shortlists s WHERE s.title_id = t.id AND s.context = ?) as shortlisted_by
      FROM list_items li
      JOIN lists l ON li.list_id = l.id
      JOIN titles t ON li.title_id = t.id
      WHERE l.name IN (${placeholders})
    `;
    const params = [context, ...listNames];

    if (context === 'family') {
      const twelveMonthsAgo = new Date();
      twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);
      const cutoffDate = twelveMonthsAgo.toISOString().split('T')[0];

      query += ' AND NOT EXISTS (SELECT 1 FROM viewings v WHERE v.title_id = t.id AND v.date >= ?)';
      params.push(cutoffDate);
    }

    query += ' ORDER BY li.priority ASC, li.added_at ASC';
    return db.prepare(query).all(...params);
  }

  it('returns items from the family list', () => {
    const items = whatToWatch('family', ['family_to_watch']);
    assert.ok(items.length >= 2);
    assert.ok(items.some(i => i.title === 'The Princess Bride'));
    assert.ok(items.some(i => i.title === 'Spirited Away'));
  });

  it('orders by priority, then added_at', () => {
    const items = whatToWatch('family', ['family_to_watch']);
    assert.equal(items[0].title, 'The Princess Bride'); // priority 1
    assert.equal(items[1].title, 'Spirited Away');       // priority 2
  });

  it('excludes titles watched in last 12 months for family context', () => {
    // Watch Princess Bride recently
    const recentDate = new Date();
    recentDate.setMonth(recentDate.getMonth() - 1);
    const dateStr = recentDate.toISOString().split('T')[0];

    db.prepare("INSERT INTO viewings (title_id, date) VALUES (?, ?)").run(ids.titles.princessBride, dateStr);

    const items = whatToWatch('family', ['family_to_watch']);
    assert.ok(!items.some(i => i.title === 'The Princess Bride'), 'Recently watched title should be excluded');
    assert.ok(items.some(i => i.title === 'Spirited Away'), 'Unwatched title should remain');
  });

  it('does NOT exclude recently watched for non-family contexts', () => {
    const items = whatToWatch('solo', ['solo_gordon']);
    // solo context doesn't filter by recent viewings
    assert.ok(items.length >= 1);
  });

  it('includes shortlist data per context', () => {
    db.prepare("INSERT OR IGNORE INTO shortlists (title_id, person, context) VALUES (?, 'Gordon', 'family')").run(ids.titles.spiritedAway);

    const items = whatToWatch('family', ['family_to_watch']);
    const spirited = items.find(i => i.title === 'Spirited Away');
    assert.ok(spirited);
    const shortlistedBy = JSON.parse(spirited.shortlisted_by);
    assert.ok(shortlistedBy.includes('Gordon'));
  });

  it('returns items from multiple lists for a multi-list context', () => {
    // Add Asterix to nupur list
    db.prepare("INSERT OR IGNORE INTO list_items (list_id, title_id, priority) VALUES (?, ?, 1)").run(ids.lists.nupur, ids.titles.asterix);

    // Create an adult_movies list and add a title
    const adultList = db.prepare("INSERT OR IGNORE INTO lists (name, display_name) VALUES ('adult_movies', 'Adult Movies')").run();
    const adultListId = adultList.lastInsertRowid || db.prepare("SELECT id FROM lists WHERE name = 'adult_movies'").get().id;
    db.prepare("INSERT OR IGNORE INTO list_items (list_id, title_id, priority) VALUES (?, ?, 1)").run(adultListId, ids.titles.breakingBad);

    const items = whatToWatch('nupur', ['with_nupur', 'adult_movies']);
    assert.ok(items.some(i => i.title === 'Asterix: The Secret of the Magic Potion'));
    assert.ok(items.some(i => i.title === 'Breaking Bad'));
  });
});
