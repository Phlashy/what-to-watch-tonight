const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseImdbId } = require('../server/lib/ratings');

describe('parseImdbId', () => {
  it('passes through a bare IMDb id', () => {
    assert.equal(parseImdbId('tt0117951'), 'tt0117951');
  });

  it('extracts the id from a full imdb.com URL', () => {
    assert.equal(parseImdbId('https://www.imdb.com/title/tt0090756/'), 'tt0090756');
  });

  it('normalises case and ignores surrounding whitespace/text', () => {
    assert.equal(parseImdbId('  TT8521736 '), 'tt8521736');
  });

  it('returns null for input with no tt id (so the route can reject it)', () => {
    assert.equal(parseImdbId('banana'), null);
    assert.equal(parseImdbId(''), null);
    assert.equal(parseImdbId(null), null);
    assert.equal(parseImdbId(undefined), null);
  });
});
