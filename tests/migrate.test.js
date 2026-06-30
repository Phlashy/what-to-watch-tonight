const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { migrate, rollbackLast } = require('../server/lib/migrate');

const hasTable = (db, name) =>
  !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?").get(name);
const hasIndex = (db, name) =>
  !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name = ?").get(name);
const hasColumn = (db, table, col) =>
  db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .some((c) => c.name === col);

describe('migration runner', () => {
  it('applies all migrations on a fresh database', () => {
    const db = new Database(':memory:');
    const ran = migrate(db);
    assert.deepEqual(ran, [
      '001_initial',
      '002_incremental',
      '003_index_viewing_people_person',
      '004_lists_icon',
      '005_ratings',
    ]);
    assert.ok(hasColumn(db, 'lists', 'icon'));
    assert.ok(hasColumn(db, 'titles', 'rt_score'));
    assert.ok(hasTable(db, 'titles'));
    assert.ok(hasTable(db, 'collection'));
    assert.ok(hasTable(db, 'show_status'));
    assert.ok(hasColumn(db, 'viewings', 'picked_by'));
    assert.ok(hasIndex(db, 'idx_viewing_people_person'));
    db.close();
  });

  it('is idempotent — a second run applies nothing', () => {
    const db = new Database(':memory:');
    migrate(db);
    assert.deepEqual(migrate(db), []);
    db.close();
  });

  it('rollbackLast reverses migrations newest-first, and migrate re-applies them', () => {
    const db = new Database(':memory:');
    migrate(db);
    assert.equal(rollbackLast(db), '005_ratings');
    assert.ok(!hasColumn(db, 'titles', 'rt_score'), 'titles.rt_score dropped');
    assert.equal(rollbackLast(db), '004_lists_icon');
    assert.ok(!hasColumn(db, 'lists', 'icon'), 'lists.icon dropped');
    assert.equal(rollbackLast(db), '003_index_viewing_people_person');
    assert.ok(!hasIndex(db, 'idx_viewing_people_person'), 'index dropped');
    assert.equal(rollbackLast(db), '002_incremental');
    assert.ok(!hasTable(db, 'collection'), 'collection dropped');
    assert.ok(!hasColumn(db, 'viewings', 'picked_by'), 'picked_by dropped');
    assert.deepEqual(
      migrate(db),
      ['002_incremental', '003_index_viewing_people_person', '004_lists_icon', '005_ratings'],
      're-applies'
    );
    assert.ok(hasTable(db, 'collection'));
    assert.ok(hasColumn(db, 'viewings', 'picked_by'));
    assert.ok(hasIndex(db, 'idx_viewing_people_person'));
    db.close();
  });
});
