/**
 * 004 — per-list icon. Lets users pick an emoji icon for their lists instead of
 * relying on a hardcoded name→emoji map (which only covered the original lists).
 */
module.exports = {
  up(db) {
    try {
      db.exec('ALTER TABLE lists ADD COLUMN icon TEXT');
    } catch (e) {
      if (!/duplicate column name/i.test(e.message)) throw e;
    }
  },
  down(db) {
    try {
      db.exec('ALTER TABLE lists DROP COLUMN icon');
    } catch {
      /* best effort */
    }
  },
};
