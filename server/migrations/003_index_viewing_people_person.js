/**
 * 003 — index viewing_people(person).
 *
 * Person-filtered queries (per-person stats, "what has X watched", the viewings
 * person filter) all join/scan viewing_people by `person`, which had no index.
 */
module.exports = {
  up(db) {
    db.exec('CREATE INDEX IF NOT EXISTS idx_viewing_people_person ON viewing_people(person)');
  },
  down(db) {
    db.exec('DROP INDEX IF EXISTS idx_viewing_people_person');
  },
};
