const express = require('express');
const router = express.Router();
const { checkLength, LIMITS } = require('../lib/validate');
const { mergeGroup } = require('../lib/merge-titles');

// GET /api/titles - search/list titles
router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const { q, type } = req.query;
  // Clamp pagination — uncapped limits would let one request dump every row.
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const offset = (page - 1) * limit;

  let query = `
    SELECT t.*,
      (SELECT MAX(v.date) FROM viewings v WHERE v.title_id = t.id) as last_watched,
      (SELECT COUNT(*) FROM viewings v WHERE v.title_id = t.id) as view_count,
      (SELECT AVG(v.rating) FROM viewings v WHERE v.title_id = t.id AND v.rating IS NOT NULL) as avg_rating,
      (SELECT json_group_array(l.display_name) FROM list_items li2 JOIN lists l ON li2.list_id = l.id WHERE li2.title_id = t.id) as on_lists
    FROM titles t
    WHERE 1=1
  `;
  const params = [];
  const countParams = [];

  if (q) {
    query += ' AND (t.title LIKE ? OR t.director LIKE ? OR t.cast LIKE ? OR t.synopsis LIKE ?)';
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
    countParams.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (type) {
    query += ' AND t.type = ?';
    params.push(type);
    countParams.push(type);
  }

  query += ' ORDER BY t.title ASC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const titles = db.prepare(query).all(...params);
  const countQuery = `SELECT COUNT(*) as c FROM titles t WHERE 1=1${q ? ' AND (t.title LIKE ? OR t.director LIKE ? OR t.cast LIKE ? OR t.synopsis LIKE ?)' : ''}${type ? ' AND t.type = ?' : ''}`;
  const total = db.prepare(countQuery).get(...countParams).c;

  res.json({ titles, total, page, limit });
});

// GET /api/titles/:id
router.get('/:id', (req, res) => {
  const db = req.app.locals.db;
  const title = db.prepare('SELECT * FROM titles WHERE id = ?').get(req.params.id);
  if (!title) return res.status(404).json({ error: 'Not found' });

  const viewings = db
    .prepare(
      `
    SELECT v.*,
      json_group_array(json_object('person', vp.person, 'role', vp.role, 'rating', vp.rating)) as people
    FROM viewings v
    LEFT JOIN viewing_people vp ON v.id = vp.viewing_id
    WHERE v.title_id = ?
    GROUP BY v.id
    ORDER BY v.date DESC NULLS LAST
  `
    )
    .all(req.params.id);

  const listMemberships = db
    .prepare(
      `
    SELECT li.id as list_item_id, l.name, l.display_name, li.streaming_service, li.note, li.source, li.added_by
    FROM list_items li JOIN lists l ON li.list_id = l.id
    WHERE li.title_id = ?
  `
    )
    .all(req.params.id);

  const collection = db
    .prepare('SELECT * FROM collection WHERE title_id = ? ORDER BY added_at ASC')
    .all(req.params.id);

  const shortlists = db
    .prepare('SELECT id, person, context FROM shortlists WHERE title_id = ?')
    .all(req.params.id);

  res.json({ ...title, viewings, listMemberships, collection, shortlists });
});

// POST /api/titles
//
// Find-or-create, not blind-create. A `tmdb_id` uniquely identifies a film or
// show, so if we already hold it we hand back the existing row (flagged
// `existing: true`) instead of minting a second one. Adding a title the library
// already has is the normal case — you search TMDB, pick the film, and only then
// does anyone discover it was already there — and treating it as a fresh insert
// is what produced 24 duplicate pairs in production. Migration 006 backs this
// with a UNIQUE index so a race between two devices can't slip past either.
router.post('/', (req, res) => {
  const db = req.app.locals.db;
  const {
    title,
    type = 'movie',
    tmdb_id,
    year,
    director,
    cast,
    genre,
    runtime_minutes,
    poster_url,
    synopsis,
  } = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });
  checkLength(title, LIMITS.title, 'Title');

  const findByTmdbId = () => db.prepare('SELECT * FROM titles WHERE tmdb_id = ?').get(tmdb_id);

  if (tmdb_id) {
    const existing = findByTmdbId();
    if (existing) return res.json({ ...existing, existing: true });
  }

  let result;
  try {
    result = db
      .prepare(
        `
    INSERT INTO titles (title, title_raw, type, tmdb_id, year, director, cast, genre, runtime_minutes, poster_url, synopsis)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
      )
      .run(
        title,
        title,
        type,
        tmdb_id || null,
        year || null,
        director || null,
        cast ? JSON.stringify(cast) : null,
        genre ? JSON.stringify(genre) : null,
        runtime_minutes || null,
        poster_url || null,
        synopsis || null
      );
  } catch (e) {
    // Lost a race to another request between the SELECT above and this INSERT —
    // the row now exists, which is exactly what the caller wanted.
    if (tmdb_id && /UNIQUE constraint failed: titles\.tmdb_id/.test(e.message)) {
      return res.json({ ...findByTmdbId(), existing: true });
    }
    throw e;
  }

  res.json(db.prepare('SELECT * FROM titles WHERE id = ?').get(result.lastInsertRowid));
});

// PUT /api/titles/:id
router.put('/:id', (req, res) => {
  const db = req.app.locals.db;
  const {
    title,
    type,
    year,
    director,
    cast,
    genre,
    runtime_minutes,
    poster_url,
    synopsis,
    tmdb_id,
  } = req.body;
  checkLength(title, LIMITS.title, 'Title');

  db.prepare(
    `
    UPDATE titles SET
      title = COALESCE(?, title),
      type = COALESCE(?, type),
      year = COALESCE(?, year),
      director = COALESCE(?, director),
      "cast" = COALESCE(?, "cast"),
      genre = COALESCE(?, genre),
      runtime_minutes = COALESCE(?, runtime_minutes),
      poster_url = COALESCE(?, poster_url),
      synopsis = COALESCE(?, synopsis),
      tmdb_id = COALESCE(?, tmdb_id),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `
  ).run(
    title ?? null,
    type ?? null,
    year ?? null,
    director ?? null,
    cast ? JSON.stringify(cast) : null,
    genre ? JSON.stringify(genre) : null,
    runtime_minutes ?? null,
    poster_url ?? null,
    synopsis ?? null,
    tmdb_id ?? null,
    req.params.id
  );

  res.json(db.prepare('SELECT * FROM titles WHERE id = ?').get(req.params.id));
});

/** What a title is carrying — shown before deleting so nothing vanishes unseen. */
function titleFootprint(db, id) {
  const one = (sql) => db.prepare(sql).get(id).c;
  return {
    viewings: one('SELECT COUNT(*) AS c FROM viewings WHERE title_id = ?'),
    listItems: one('SELECT COUNT(*) AS c FROM list_items WHERE title_id = ?'),
    shortlists: one('SELECT COUNT(*) AS c FROM shortlists WHERE title_id = ?'),
    collection: one('SELECT COUNT(*) AS c FROM collection WHERE title_id = ?'),
    showStatus: one('SELECT COUNT(*) AS c FROM show_status WHERE title_id = ?'),
  };
}

// GET /api/titles/:id/footprint — what deleting this title would destroy.
// The client asks first so the confirmation can name the cost ("3 viewings, on
// 2 lists") instead of a vague "are you sure?".
router.get('/:id/footprint', (req, res) => {
  const db = req.app.locals.db;
  const title = db.prepare('SELECT id, title FROM titles WHERE id = ?').get(req.params.id);
  if (!title) return res.status(404).json({ error: 'Title not found' });
  res.json({ ...title, ...titleFootprint(db, req.params.id) });
});

// DELETE /api/titles/:id
//
// Removes the title and everything hanging off it. There is no soft delete: this
// is for entries that shouldn't exist at all — a mis-scanned DVD, a bad TMDB
// match logged by mistake — where leaving a tombstone would be the same clutter
// the user is trying to clear.
//
// Every child row must go first: foreign keys are ON, so a bare DELETE would be
// rejected while viewings or list items still point at it.
router.delete('/:id', (req, res) => {
  const db = req.app.locals.db;
  const title = db.prepare('SELECT id, title FROM titles WHERE id = ?').get(req.params.id);
  if (!title) return res.status(404).json({ error: 'Title not found' });

  const removed = titleFootprint(db, req.params.id);

  db.transaction(() => {
    // viewing_people hangs off viewings, not titles — clear it before its parent.
    db.prepare(
      'DELETE FROM viewing_people WHERE viewing_id IN (SELECT id FROM viewings WHERE title_id = ?)'
    ).run(req.params.id);
    for (const table of ['viewings', 'list_items', 'shortlists', 'collection', 'show_status']) {
      db.prepare(`DELETE FROM ${table} WHERE title_id = ?`).run(req.params.id);
    }
    db.prepare('DELETE FROM titles WHERE id = ?').run(req.params.id);
  })();

  res.json({ deleted: title, removed });
});

// POST /api/titles/:id/merge-into/:targetId
//
// Fold this title into another and delete it — for when the same film ended up in
// the library twice under different TMDB matches. Everything moves to the target:
// viewings, list memberships, stars, discs, show status.
//
// This is the way out of the dead end you hit when re-matching a title to a TMDB
// entry another title already claims (see the 409 in routes/tmdb.js). The usual
// shape is a wrong row that carries the watch history and a right row that
// carries none, so the target is passed explicitly rather than inferred from
// which row has the most history — that heuristic would keep the wrong one.
router.post('/:id/merge-into/:targetId', (req, res) => {
  const db = req.app.locals.db;
  const sourceId = Number(req.params.id);
  const targetId = Number(req.params.targetId);

  if (!Number.isInteger(sourceId) || !Number.isInteger(targetId)) {
    return res.status(400).json({ error: 'Both ids must be numbers.' });
  }
  if (sourceId === targetId) {
    return res.status(400).json({ error: "A title can't be merged into itself." });
  }

  const source = db.prepare('SELECT id, title FROM titles WHERE id = ?').get(sourceId);
  const target = db.prepare('SELECT id, title FROM titles WHERE id = ?').get(targetId);
  if (!source) return res.status(404).json({ error: 'Title to merge not found' });
  if (!target) return res.status(404).json({ error: 'Title to merge into not found' });

  const report = db.transaction(() => mergeGroup(db, [sourceId, targetId], targetId))();

  res.json({
    merged: source,
    into: db.prepare('SELECT * FROM titles WHERE id = ?').get(targetId),
    moved: {
      viewings: report.viewings.moved,
      viewingsCollapsed: report.viewings.collapsed,
      listItems: report.listItems.moved,
      listItemsFolded: report.listItems.folded,
      shortlists: report.shortlists.moved,
      collection: report.collection.moved,
      showStatus: report.showStatus.moved,
    },
  });
});

module.exports = router;
