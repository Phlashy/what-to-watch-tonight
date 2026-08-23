const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { createTestDb, seedTestData, TEST_CONFIG } = require('./helpers');
const { executeToolCall } = require('../server/routes/chat');
const rotationCore = require('../server/lib/rotation');

// Unit tests for the chat assistant's tool layer (server/routes/chat.js).
// executeToolCall is the same dispatcher the agentic loop uses, run here against
// an in-memory database — so these exercise the real SQL the assistant relies on.
//
// The /api/chat HTTP route itself isn't covered (it calls the paid Anthropic
// API); everything below it is.
describe('chat assistant tools', () => {
  let db, ids;

  const call = (name, input = {}) => executeToolCall(db, name, input, TEST_CONFIG);

  before(() => {
    db = createTestDb();
    ids = seedTestData(db);

    // Viewings: two with per-person ratings, one legacy (group rating only).
    const addViewing = (titleId, date, rating = null) =>
      db
        .prepare("INSERT INTO viewings (title_id, date, rating, tags) VALUES (?, ?, ?, '[]')")
        .run(titleId, date, rating).lastInsertRowid;
    const addPerson = (viewingId, person, rating) =>
      db
        .prepare(
          "INSERT INTO viewing_people (viewing_id, person, role, rating) VALUES (?, ?, 'chooser', ?)"
        )
        .run(viewingId, person, rating);

    const v1 = addViewing(ids.titles.princessBride, '2026-01-10');
    addPerson(v1, 'Gordon', 5);
    addPerson(v1, 'Davin', 4);

    const v2 = addViewing(ids.titles.spiritedAway, '2026-02-01');
    addPerson(v2, 'Gordon', 4);

    // Legacy shape: a group rating on the viewing, no per-person rows.
    addViewing(ids.titles.breakingBad, '2025-12-01', 5);
  });

  describe('search_titles', () => {
    it('matches by title text', () => {
      const results = call('search_titles', { query: 'princess' });
      assert.equal(results.length, 1);
      assert.equal(results[0].title, 'The Princess Bride');
      assert.equal(results[0].view_count, 1);
    });

    it('matches by director', () => {
      const results = call('search_titles', { query: 'Miyazaki' });
      assert.equal(results.length, 1);
      assert.equal(results[0].title, 'Spirited Away');
    });

    it('filters by type and genre', () => {
      const shows = call('search_titles', { type: 'show' });
      assert.deepEqual(
        shows.map((t) => t.title),
        ['Breaking Bad']
      );
      const comedies = call('search_titles', { genre: 'Comedy' });
      assert.deepEqual(comedies.map((t) => t.title).sort(), [
        'Asterix: The Secret of the Magic Potion',
        'The Princess Bride',
      ]);
    });

    it('averages per-person ratings, falling back to the group rating', () => {
      const [pb] = call('search_titles', { query: 'princess' });
      assert.equal(pb.avg_rating, 4.5); // Gordon 5, Davin 4
      const [bb] = call('search_titles', { query: 'breaking' });
      assert.equal(bb.avg_rating, 5); // legacy group rating
    });

    it('tolerates an oversized limit (clamped server-side)', () => {
      const results = call('search_titles', { limit: 99999 });
      assert.ok(Array.isArray(results));
      assert.ok(results.length <= 50);
    });

    describe('critic ratings, runtime, and age certificate', () => {
      before(() => {
        // Back-fill the OMDb-sourced columns the search now filters/sorts on.
        // Runtimes from the base seed: Princess Bride 98, Spirited Away 125,
        // Breaking Bad 49 (a show). Asterix has none — give it 85 so it's the
        // shortest movie, and leave its critic scores null to test NULLS-last.
        const set = db.prepare(
          'UPDATE titles SET rt_score = ?, imdb_rating = ?, metacritic_score = ?, content_rating = ?, runtime_minutes = COALESCE(?, runtime_minutes) WHERE id = ?'
        );
        set.run(94, 8.0, 77, 'PG', null, ids.titles.princessBride);
        set.run(97, 8.6, 96, 'PG', null, ids.titles.spiritedAway);
        set.run(96, 9.5, 87, 'TV-MA', null, ids.titles.breakingBad);
        set.run(null, null, null, 'PG', 85, ids.titles.asterix);
      });

      it('returns the critic scores, runtime, and certificate on each result', () => {
        const [pb] = call('search_titles', { query: 'princess' });
        assert.equal(pb.rt_score, 94);
        assert.equal(pb.imdb_rating, 8.0);
        assert.equal(pb.metacritic_score, 77);
        assert.equal(pb.content_rating, 'PG');
        assert.equal(pb.runtime_minutes, 98);
      });

      it('filters by a Rotten Tomatoes floor (min_rt), excluding unscored titles', () => {
        const results = call('search_titles', { min_rt: 96 });
        assert.deepEqual(
          results.map((t) => t.title).sort(),
          ['Breaking Bad', 'Spirited Away'] // 94 (PB) excluded, null (Asterix) excluded
        );
      });

      it('filters by an IMDb floor (min_imdb)', () => {
        const results = call('search_titles', { min_imdb: 9 });
        assert.deepEqual(
          results.map((t) => t.title),
          ['Breaking Bad']
        );
      });

      it('filters by a runtime window (movies under 100 minutes)', () => {
        const results = call('search_titles', { type: 'movie', max_runtime: 100 });
        assert.deepEqual(results.map((t) => t.title).sort(), [
          'Asterix: The Secret of the Magic Potion', // 85
          'The Princess Bride', // 98
        ]);
      });

      it('filters by age certificate — array of allowed certs', () => {
        const pg = call('search_titles', { content_rating: ['PG'] });
        assert.deepEqual(pg.map((t) => t.title).sort(), [
          'Asterix: The Secret of the Magic Potion',
          'Spirited Away',
          'The Princess Bride',
        ]);
      });

      it('filters by age certificate — single string, case-insensitive', () => {
        const results = call('search_titles', { content_rating: 'tv-ma' });
        assert.deepEqual(
          results.map((t) => t.title),
          ['Breaking Bad']
        );
      });

      it('sorts by Rotten Tomatoes highest-first, unscored titles last', () => {
        const results = call('search_titles', { sort: 'rt_score' });
        assert.deepEqual(
          results.map((t) => t.title),
          [
            'Spirited Away', // 97
            'Breaking Bad', // 96
            'The Princess Bride', // 94
            'Asterix: The Secret of the Magic Potion', // null → last
          ]
        );
      });

      it('sorts by runtime shortest-first', () => {
        const results = call('search_titles', { type: 'movie', sort: 'runtime' });
        assert.deepEqual(
          results.map((t) => t.title),
          [
            'Asterix: The Secret of the Magic Potion', // 85
            'The Princess Bride', // 98
            'Spirited Away', // 125
          ]
        );
      });

      it('honours sort_dir to flip the default direction', () => {
        const asc = call('search_titles', { sort: 'rt_score', sort_dir: 'asc' });
        // Ascending, but unscored (Asterix) still sorts last.
        assert.deepEqual(
          asc.map((t) => t.title),
          [
            'The Princess Bride', // 94
            'Breaking Bad', // 96
            'Spirited Away', // 97
            'Asterix: The Secret of the Magic Potion', // null → last
          ]
        );
      });
    });
  });

  describe('get_title_details', () => {
    it('returns viewings with people, list memberships, and collection', () => {
      const details = call('get_title_details', { title_id: ids.titles.princessBride });
      assert.equal(details.title, 'The Princess Bride');
      assert.equal(details.viewings.length, 1);
      const people = JSON.parse(details.viewings[0].people);
      assert.deepEqual(people.map((p) => p.person).sort(), ['Davin', 'Gordon']);
      assert.equal(details.listMemberships[0].name, 'family_to_watch');
      assert.ok(Array.isArray(details.collection));
    });

    it('returns an error for an unknown id', () => {
      assert.deepEqual(call('get_title_details', { title_id: 999999 }), {
        error: 'Title not found',
      });
    });
  });

  describe('get_viewing_history', () => {
    it('returns newest-first by default', () => {
      const rows = call('get_viewing_history', {});
      assert.deepEqual(
        rows.map((r) => r.title),
        ['Spirited Away', 'The Princess Bride', 'Breaking Bad']
      );
    });

    it('filters by person', () => {
      const rows = call('get_viewing_history', { person: 'Davin' });
      assert.deepEqual(
        rows.map((r) => r.title),
        ['The Princess Bride']
      );
    });

    it('filters by date range and title search', () => {
      const jan = call('get_viewing_history', { from_date: '2026-01-01', to_date: '2026-01-31' });
      assert.deepEqual(
        jan.map((r) => r.title),
        ['The Princess Bride']
      );
      const search = call('get_viewing_history', { search: 'spirited' });
      assert.equal(search.length, 1);
    });

    it('sorts by rating when asked', () => {
      const rows = call('get_viewing_history', { sort: 'rating' });
      // Princess Bride (max 5) and Breaking Bad (group 5) outrank Spirited Away (4).
      assert.equal(rows[rows.length - 1].title, 'Spirited Away');
    });
  });

  describe('lists', () => {
    it('get_list_items returns items in priority order', () => {
      const result = call('get_list_items', { list_name: 'family_to_watch' });
      assert.equal(result.item_count, 2);
      assert.deepEqual(
        result.items.map((i) => i.title),
        ['The Princess Bride', 'Spirited Away']
      );
    });

    it('get_list_items errors on an unknown list', () => {
      assert.ok(call('get_list_items', { list_name: 'nope' }).error);
    });

    it('get_all_lists returns every list with its item count', () => {
      const lists = call('get_all_lists');
      assert.equal(lists.length, 3);
      assert.equal(lists.find((l) => l.name === 'family_to_watch').item_count, 2);
      assert.equal(lists.find((l) => l.name === 'with_nupur').item_count, 0);
    });

    it('add_to_list inserts, rejects duplicates, and validates ids', () => {
      const ok = call('add_to_list', {
        title_id: ids.titles.asterix,
        list_name: 'with_nupur',
        added_by: 'Gordon',
        confirmed: true,
      });
      assert.equal(ok.success, true);

      const dup = call('add_to_list', {
        title_id: ids.titles.asterix,
        list_name: 'with_nupur',
        confirmed: true,
      });
      assert.match(dup.error, /already on/);

      assert.ok(
        call('add_to_list', { title_id: ids.titles.asterix, list_name: 'nope', confirmed: true })
          .error
      );
      assert.ok(
        call('add_to_list', { title_id: 999999, list_name: 'with_nupur', confirmed: true }).error
      );
    });

    it('remove_from_list deletes, then reports a missing item', () => {
      const ok = call('remove_from_list', {
        title_id: ids.titles.asterix,
        list_name: 'with_nupur',
        confirmed: true,
      });
      assert.equal(ok.success, true);
      const gone = call('remove_from_list', {
        title_id: ids.titles.asterix,
        list_name: 'with_nupur',
        confirmed: true,
      });
      assert.match(gone.error, /not found/);
    });

    it('refuses to mutate a list without confirmed:true (and does not change data)', () => {
      // No confirmed flag → rejected, nothing added.
      const blocked = call('add_to_list', {
        title_id: ids.titles.breakingBad,
        list_name: 'with_nupur',
      });
      assert.match(blocked.error, /not confirmed/i);

      // confirmed:false is treated the same as missing.
      const blockedFalse = call('add_to_list', {
        title_id: ids.titles.breakingBad,
        list_name: 'with_nupur',
        confirmed: false,
      });
      assert.match(blockedFalse.error, /not confirmed/i);

      const onList = call('get_list_items', { list_name: 'with_nupur' }).items.some(
        (i) => i.title_id === ids.titles.breakingBad
      );
      assert.equal(onList, false);

      // remove_from_list is gated the same way.
      const blockedRemove = call('remove_from_list', {
        title_id: ids.titles.princessBride,
        list_name: 'family_to_watch',
      });
      assert.match(blockedRemove.error, /not confirmed/i);
      const stillThere = call('get_list_items', { list_name: 'family_to_watch' }).items.some(
        (i) => i.title_id === ids.titles.princessBride
      );
      assert.equal(stillThere, true);
    });
  });

  describe('stats tools', () => {
    it('get_person_stats aggregates totals, average, and genres', () => {
      const stats = call('get_person_stats', { person: 'Gordon' });
      assert.equal(stats.total_viewings, 2);
      assert.equal(stats.avg_rating, 4.5);
      assert.equal(stats.top_rated[0].title, 'The Princess Bride');
      const adventure = stats.top_genres.find((g) => g.genre === 'Adventure');
      assert.equal(adventure.count, 2); // Princess Bride + Spirited Away
    });

    it('get_top_directors counts viewings, optionally per person', () => {
      const all = call('get_top_directors', {});
      assert.equal(all.length, 3);
      assert.ok(all.every((d) => d.view_count === 1));
      const davin = call('get_top_directors', { person: 'Davin' });
      assert.deepEqual(
        davin.map((d) => d.director),
        ['Rob Reiner']
      );
    });

    it('get_top_genres ranks genres across viewings', () => {
      const genres = call('get_top_genres', {});
      assert.equal(genres[0].genre, 'Adventure');
      assert.equal(genres[0].count, 2);
    });
  });

  describe('get_family_rotation', () => {
    it('matches the shared rotation core (same source as the Tonight tab)', () => {
      const state = call('get_family_rotation');
      assert.equal(state.next_chooser, 'Davin'); // unset → first in rotation
      assert.deepEqual(state.rotation, TEST_CONFIG.rotation);

      rotationCore.advanceRotation(db, TEST_CONFIG.rotation);
      const advanced = call('get_family_rotation');
      assert.equal(advanced.next_chooser, 'Arianne');
      assert.equal(advanced.last_chooser, 'Davin');
    });
  });

  describe('dispatcher', () => {
    it('reports unknown tools', () => {
      assert.deepEqual(call('no_such_tool'), { error: 'Unknown tool: no_such_tool' });
    });

    it('turns a thrown error into a safe error result', () => {
      const broken = {
        prepare() {
          throw new Error('boom');
        },
      };
      const result = executeToolCall(broken, 'search_titles', {}, TEST_CONFIG);
      assert.deepEqual(result, { error: 'Failed to execute search_titles' });
    });
  });
});
