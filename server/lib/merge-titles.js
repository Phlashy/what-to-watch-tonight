/**
 * Merge duplicate title rows.
 *
 * Two rows are duplicates when they share a `tmdb_id` — that id comes straight
 * from TMDB, so it's the one identifier we can trust to mean "the same film or
 * show". (Names can't be trusted: the library holds both "The Beasts" and
 * "The Beasts (As Bestas)", and both "Harry Potter" and the full title.)
 *
 * Duplicates arose because every "add a title" path did an unconditional INSERT
 * with no check for an existing row. That's fixed at the source in
 * POST /api/titles, and migration 006 puts a UNIQUE index on tmdb_id so it can't
 * come back — but the index can't be created until the existing pairs are merged,
 * which is what this module does.
 *
 * Merging keeps ONE row (the "canonical" one) and re-points every child row at
 * it: viewings, list_items, shortlists, collection, show_status. Four of those
 * tables have UNIQUE constraints that a blind UPDATE would violate (e.g. Weapons
 * sat on "Cinema flicks I missed" under BOTH ids), so each is moved row by row:
 * if the canonical row already has an equivalent, the two are folded together —
 * filling in NULLs and keeping the earliest timestamp — rather than one being
 * silently dropped.
 *
 * Nothing here is TMDB-aware and nothing is instance-specific, so it is safe to
 * run against any copy of the database.
 */
'use strict';

/** Title columns worth back-filling onto the canonical row from its duplicates. */
const META_COLUMNS = [
  'title_raw',
  'year',
  'director',
  'cast',
  'genre',
  'runtime_minutes',
  'poster_url',
  'synopsis',
  'watch_providers',
  'watch_providers_updated_at',
  'imdb_id',
  'rt_score',
  'imdb_rating',
  'metacritic_score',
  'ratings_updated_at',
];

/** Take `b`'s value only where `a` has none. */
function coalesce(a, b) {
  return a === null || a === undefined ? b : a;
}

/** Earliest of two timestamps, tolerating NULLs on either side. */
function earliest(a, b) {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}

/**
 * Every set of title rows sharing a tmdb_id, worst offenders first.
 * @returns {Array<{tmdb_id: number, ids: number[]}>}
 */
function findDuplicateGroups(db) {
  return db
    .prepare(
      `SELECT tmdb_id, GROUP_CONCAT(id) AS ids, COUNT(*) AS cnt
         FROM titles
        WHERE tmdb_id IS NOT NULL
        GROUP BY tmdb_id
       HAVING cnt > 1
        ORDER BY cnt DESC, tmdb_id`
    )
    .all()
    .map((r) => ({
      tmdb_id: r.tmdb_id,
      ids: r.ids
        .split(',')
        .map(Number)
        .sort((a, b) => a - b),
    }));
}

/**
 * Which row survives: the one carrying the most history. Viewings matter most
 * (they're irreplaceable), then list memberships, then stars and discs. Ties go
 * to the oldest row, which is usually the one with the fuller name.
 */
function pickCanonicalId(db, ids) {
  const placeholders = ids.map(() => '?').join(',');
  return db
    .prepare(
      `SELECT t.id,
              (SELECT COUNT(*) FROM viewings    WHERE title_id = t.id) AS vc,
              (SELECT COUNT(*) FROM list_items  WHERE title_id = t.id) AS lc,
              (SELECT COUNT(*) FROM shortlists  WHERE title_id = t.id) AS sc,
              (SELECT COUNT(*) FROM collection  WHERE title_id = t.id) AS cc,
              (SELECT COUNT(*) FROM show_status WHERE title_id = t.id) AS ssc
         FROM titles t
        WHERE t.id IN (${placeholders})
        ORDER BY vc DESC, lc DESC, sc DESC, cc DESC, ssc DESC, t.id ASC
        LIMIT 1`
    )
    .get(...ids).id;
}

/** Fill any gap on the canonical row from whichever duplicate has the value. */
function backfillMetadata(db, canonicalId, otherIds) {
  const canonical = db.prepare('SELECT * FROM titles WHERE id = ?').get(canonicalId);
  const others = otherIds.map((id) => db.prepare('SELECT * FROM titles WHERE id = ?').get(id));
  const patch = {};

  for (const col of META_COLUMNS) {
    if (canonical[col] !== null && canonical[col] !== undefined) continue;
    const donor = others.find((o) => o[col] !== null && o[col] !== undefined);
    if (donor) patch[col] = donor[col];
  }

  const cols = Object.keys(patch);
  if (cols.length === 0) return [];

  db.prepare(`UPDATE titles SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(
    ...cols.map((c) => patch[c]),
    canonicalId
  );
  return cols;
}

/**
 * Fold `dropId`'s viewing into `keepId`: gaps filled, watchers combined.
 * Used when the same screening was logged twice, once under each title row.
 */
function absorbViewing(db, keepId, dropId) {
  const keep = db.prepare('SELECT * FROM viewings WHERE id = ?').get(keepId);
  const drop = db.prepare('SELECT * FROM viewings WHERE id = ?').get(dropId);

  const tagsEmpty = !keep.tags || keep.tags === '[]';
  db.prepare(
    `UPDATE viewings
        SET rating = ?, notes = ?, picked_by = ?, tags = ?, date_precision = ?
      WHERE id = ?`
  ).run(
    coalesce(keep.rating, drop.rating),
    coalesce(keep.notes, drop.notes),
    coalesce(keep.picked_by, drop.picked_by),
    tagsEmpty && drop.tags ? drop.tags : keep.tags,
    coalesce(keep.date_precision, drop.date_precision),
    keepId
  );

  // Move across only the people who aren't already on the surviving viewing.
  const present = new Set(
    db
      .prepare('SELECT person FROM viewing_people WHERE viewing_id = ?')
      .all(keepId)
      .map((r) => r.person)
  );
  for (const vp of db.prepare('SELECT * FROM viewing_people WHERE viewing_id = ?').all(dropId)) {
    if (present.has(vp.person)) continue;
    db.prepare('UPDATE viewing_people SET viewing_id = ? WHERE id = ?').run(keepId, vp.id);
    present.add(vp.person);
  }

  db.prepare('DELETE FROM viewing_people WHERE viewing_id = ?').run(dropId);
  db.prepare('DELETE FROM viewings WHERE id = ?').run(dropId);
}

/**
 * Move every viewing onto the canonical row, collapsing same-day pairs that
 * came from *different* title rows — those are one screening logged twice.
 *
 * Two same-day viewings already sitting on one row are left alone: that's a
 * genuine (if unusual) double-watch the user entered deliberately, and this
 * merge has no business second-guessing it.
 */
function mergeViewings(db, canonicalId, otherIds) {
  const ids = [canonicalId, ...otherIds];
  const placeholders = ids.map(() => '?').join(',');
  const viewings = db
    .prepare(
      `SELECT id, title_id, date, rating FROM viewings
        WHERE title_id IN (${placeholders}) ORDER BY id`
    )
    .all(...ids);

  const byDate = new Map();
  for (const v of viewings) {
    // A viewing with no date can't be matched to anything — key it to itself.
    const key = v.date || `#${v.id}`;
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key).push(v);
  }

  let collapsed = 0;
  for (const sameDay of byDate.values()) {
    if (sameDay.length < 2) continue;
    if (new Set(sameDay.map((v) => v.title_id)).size < 2) continue;

    const scored = sameDay.map((v) => ({
      ...v,
      people: db.prepare('SELECT COUNT(*) AS c FROM viewing_people WHERE viewing_id = ?').get(v.id)
        .c,
    }));
    // Keep whichever entry the user filled in most: a rating, then watchers.
    scored.sort(
      (a, b) => (b.rating !== null) - (a.rating !== null) || b.people - a.people || a.id - b.id
    );

    for (const drop of scored.slice(1)) {
      absorbViewing(db, scored[0].id, drop.id);
      collapsed++;
    }
  }

  const moved = db
    .prepare(
      `UPDATE viewings SET title_id = ?
        WHERE title_id IN (${otherIds.map(() => '?').join(',')})`
    )
    .run(canonicalId, ...otherIds).changes;

  return { moved, collapsed };
}

/**
 * Re-point rows in a child table that has a UNIQUE constraint including
 * title_id. Where the canonical row already has an equivalent, the duplicate is
 * folded into it via `fold` instead of being dropped on the floor.
 *
 * @param {string} table
 * @param {string[]} matchOn  other columns in the UNIQUE constraint
 * @param {(db, keepRow, dropRow) => void} fold
 */
function mergeChildTable(db, table, matchOn, fold, canonicalId, otherIds) {
  let moved = 0;
  let folded = 0;

  for (const otherId of otherIds) {
    const rows = db.prepare(`SELECT * FROM ${table} WHERE title_id = ?`).all(otherId);
    for (const row of rows) {
      const where = matchOn.map((c) => `${c} = ?`).join(' AND ');
      const existing = db
        .prepare(`SELECT * FROM ${table} WHERE title_id = ? AND ${where}`)
        .get(canonicalId, ...matchOn.map((c) => row[c]));

      if (existing) {
        fold(db, existing, row);
        db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(row.id);
        folded++;
      } else {
        db.prepare(`UPDATE ${table} SET title_id = ? WHERE id = ?`).run(canonicalId, row.id);
        moved++;
      }
    }
  }

  return { moved, folded };
}

function foldListItem(db, keep, drop) {
  db.prepare(
    `UPDATE list_items
        SET streaming_service = ?, source = ?, note = ?, priority = ?, added_by = ?, added_at = ?
      WHERE id = ?`
  ).run(
    coalesce(keep.streaming_service, drop.streaming_service),
    coalesce(keep.source, drop.source),
    coalesce(keep.note, drop.note),
    coalesce(keep.priority, drop.priority),
    coalesce(keep.added_by, drop.added_by),
    earliest(keep.added_at, drop.added_at),
    keep.id
  );
}

function foldCollection(db, keep, drop) {
  db.prepare('UPDATE collection SET platform = ?, notes = ?, added_at = ? WHERE id = ?').run(
    coalesce(keep.platform, drop.platform),
    coalesce(keep.notes, drop.notes),
    earliest(keep.added_at, drop.added_at),
    keep.id
  );
}

function foldShowStatus(db, keep, drop) {
  db.prepare('UPDATE show_status SET started_date = ?, ended_date = ?, notes = ? WHERE id = ?').run(
    coalesce(keep.started_date, drop.started_date),
    coalesce(keep.ended_date, drop.ended_date),
    coalesce(keep.notes, drop.notes),
    keep.id
  );
}

/** A star is a star — the duplicate carries nothing worth folding in. */
function foldShortlist() {}

/**
 * Merge one group of duplicate rows into a single title.
 * @returns a report of what moved, for logging.
 */
function mergeGroup(db, ids) {
  const canonicalId = pickCanonicalId(db, ids);
  const otherIds = ids.filter((id) => id !== canonicalId);
  const canonical = db.prepare('SELECT id, title, year FROM titles WHERE id = ?').get(canonicalId);
  const removed = otherIds.map((id) =>
    db.prepare('SELECT id, title FROM titles WHERE id = ?').get(id)
  );

  const backfilled = backfillMetadata(db, canonicalId, otherIds);
  const viewings = mergeViewings(db, canonicalId, otherIds);
  const listItems = mergeChildTable(
    db,
    'list_items',
    ['list_id'],
    foldListItem,
    canonicalId,
    otherIds
  );
  const shortlists = mergeChildTable(
    db,
    'shortlists',
    ['person', 'context'],
    foldShortlist,
    canonicalId,
    otherIds
  );
  const collection = mergeChildTable(
    db,
    'collection',
    ['format'],
    foldCollection,
    canonicalId,
    otherIds
  );
  const showStatus = mergeChildTable(
    db,
    'show_status',
    ['person'],
    foldShowStatus,
    canonicalId,
    otherIds
  );

  for (const id of otherIds) db.prepare('DELETE FROM titles WHERE id = ?').run(id);

  return {
    canonical,
    removed,
    backfilled,
    viewings,
    listItems,
    shortlists,
    collection,
    showStatus,
  };
}

/**
 * Merge every duplicate group in the database.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {{log?: (msg: string) => void}} [opts]
 * @returns {{groups: number, titlesRemoved: number, reports: object[]}}
 */
function mergeDuplicateTitles(db, { log } = {}) {
  const groups = findDuplicateGroups(db);
  const reports = [];
  let titlesRemoved = 0;

  // One transaction per group: a group that somehow fails rolls back alone
  // instead of taking the clean merges down with it.
  const run = db.transaction((ids) => mergeGroup(db, ids));

  for (const group of groups) {
    const report = run(group.ids);
    reports.push(report);
    titlesRemoved += report.removed.length;

    if (log) {
      const names = report.removed.map((r) => `#${r.id}`).join(', ');
      log(
        `  "${report.canonical.title}" → kept #${report.canonical.id}, removed ${names} ` +
          `(${report.viewings.moved} viewing(s) moved, ${report.viewings.collapsed} collapsed; ` +
          `${report.listItems.moved} list item(s) moved, ${report.listItems.folded} folded)`
      );
    }
  }

  return { groups: groups.length, titlesRemoved, reports };
}

module.exports = { mergeDuplicateTitles, findDuplicateGroups, mergeGroup, pickCanonicalId };
