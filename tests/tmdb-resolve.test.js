const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseTitleRef } = require('../server/routes/tmdb');

// Pure parser behind GET /api/tmdb/resolve — the network call itself hits the
// live TMDB API so isn't unit-tested, but the link/id parsing is all logic.
describe('parseTitleRef', () => {
  it('reads an IMDb id from a full URL', () => {
    assert.deepEqual(parseTitleRef('https://www.imdb.com/title/tt41429881/'), {
      kind: 'imdb',
      imdb_id: 'tt41429881',
    });
  });

  it('reads a bare IMDb id (case-insensitive)', () => {
    assert.deepEqual(parseTitleRef('TT0111161'), { kind: 'imdb', imdb_id: 'tt0111161' });
  });

  it('reads a TMDB movie URL with a slug', () => {
    assert.deepEqual(parseTitleRef('https://www.themoviedb.org/movie/693134-dune-part-two'), {
      kind: 'tmdb',
      media_type: 'movie',
      tmdb_id: 693134,
    });
  });

  it('reads a TMDB tv URL', () => {
    assert.deepEqual(parseTitleRef('themoviedb.org/tv/1396'), {
      kind: 'tmdb',
      media_type: 'tv',
      tmdb_id: 1396,
    });
  });

  it('returns null for anything it does not recognise', () => {
    assert.equal(parseTitleRef('just some words'), null);
    assert.equal(parseTitleRef(''), null);
    assert.equal(parseTitleRef(undefined), null);
  });
});
