const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { createTestDb, seedTestData } = require('./helpers');

describe('Lists', () => {
  let db, ids;

  before(() => {
    db = createTestDb();
    ids = seedTestData(db);
  });

  describe('list queries', () => {
    it('returns all lists with item counts', () => {
      const lists = db.prepare(`
        SELECT l.*, COUNT(li.id) as item_count
        FROM lists l LEFT JOIN list_items li ON l.id = li.list_id
        GROUP BY l.id ORDER BY l.id ASC
      `).all();

      assert.ok(lists.length >= 3);
      const family = lists.find(l => l.name === 'family_to_watch');
      assert.equal(family.item_count, 2); // Princess Bride + Spirited Away
    });

    it('returns items for a list with title metadata', () => {
      const list = db.prepare("SELECT * FROM lists WHERE name = 'family_to_watch'").get();
      const items = db.prepare(`
        SELECT li.*, t.title, t.year, t.director
        FROM list_items li JOIN titles t ON li.title_id = t.id
        WHERE li.list_id = ?
        ORDER BY li.priority ASC, li.added_at ASC
      `).all(list.id);

      assert.equal(items.length, 2);
      assert.equal(items[0].title, 'The Princess Bride'); // priority 1
      assert.equal(items[1].title, 'Spirited Away');       // priority 2
    });
  });

  describe('adding items', () => {
    it('adds a title to a list', () => {
      const result = db.prepare(
        "INSERT INTO list_items (list_id, title_id, streaming_service, note, added_by) VALUES (?, ?, 'Netflix', 'Highly recommended', 'Gordon')"
      ).run(ids.lists.nupur, ids.titles.breakingBad);

      const item = db.prepare('SELECT * FROM list_items WHERE id = ?').get(result.lastInsertRowid);
      assert.equal(item.streaming_service, 'Netflix');
      assert.equal(item.note, 'Highly recommended');
      assert.equal(item.added_by, 'Gordon');
    });

    it('rejects duplicate title on same list (UNIQUE constraint)', () => {
      assert.throws(() => {
        db.prepare("INSERT INTO list_items (list_id, title_id) VALUES (?, ?)").run(
          ids.lists.family, ids.titles.princessBride  // already on family list
        );
      }, /UNIQUE/);
    });

    it('allows same title on different lists', () => {
      assert.doesNotThrow(() => {
        db.prepare("INSERT INTO list_items (list_id, title_id) VALUES (?, ?)").run(
          ids.lists.nupur, ids.titles.princessBride
        );
      });
    });
  });

  describe('reordering', () => {
    it('bulk updates priorities in a transaction', () => {
      const update = db.prepare('UPDATE list_items SET priority = ? WHERE id = ?');
      const tx = db.transaction((ids) => {
        ids.forEach((id, i) => update.run(i + 1, id));
      });

      // Reverse the order
      tx([ids.listItems.spiritedAwayFamily, ids.listItems.princessBrideFamily]);

      const items = db.prepare(`
        SELECT * FROM list_items WHERE list_id = ? ORDER BY priority ASC
      `).all(ids.lists.family);
      assert.equal(items[0].title_id, ids.titles.spiritedAway); // now priority 1
      assert.equal(items[1].title_id, ids.titles.princessBride); // now priority 2
    });
  });

  describe('removal', () => {
    it('removes an item from a list', () => {
      const item = db.prepare("INSERT INTO list_items (list_id, title_id) VALUES (?, ?)").run(
        ids.lists.solo, ids.titles.spiritedAway
      );

      db.prepare('DELETE FROM list_items WHERE id = ?').run(item.lastInsertRowid);
      assert.equal(
        db.prepare('SELECT * FROM list_items WHERE id = ?').get(item.lastInsertRowid),
        undefined
      );
    });
  });
});
