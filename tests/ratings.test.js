const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseImdbId, parseContentRating } = require('../server/lib/ratings');
const { createTestDb } = require('./helpers');

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

// The age certificate comes from OMDb's `Rated` field, in the same response that
// already supplies the RT/IMDb/Metacritic scores — so it costs no extra request.
describe('parseContentRating', () => {
  it('keeps real film certificates', () => {
    assert.equal(parseContentRating('G'), 'G');
    assert.equal(parseContentRating('PG'), 'PG');
    assert.equal(parseContentRating('PG-13'), 'PG-13');
    assert.equal(parseContentRating('R'), 'R');
  });

  it('keeps TV certificates, which is what shows come back with', () => {
    assert.equal(parseContentRating('TV-14'), 'TV-14');
    assert.equal(parseContentRating('TV-MA'), 'TV-MA');
  });

  it('treats OMDb\'s various "we don\'t know" values as no certificate', () => {
    // Showing "N/A" or "Approved" in a badge is worse than showing nothing —
    // neither tells a parent anything about age suitability.
    for (const value of ['N/A', 'Not Rated', 'UNRATED', 'NR', 'Approved', 'Passed', '']) {
      assert.equal(parseContentRating(value), null, `${value} should be treated as absent`);
    }
  });

  it('returns null rather than throwing on missing input', () => {
    assert.equal(parseContentRating(null), null);
    assert.equal(parseContentRating(undefined), null);
  });

  it('trims stray whitespace', () => {
    assert.equal(parseContentRating('  PG-13 '), 'PG-13');
  });
});

describe('content_rating column (migration 007)', () => {
  it('exists and stores a certificate', () => {
    const db = createTestDb();
    const id = db
      .prepare("INSERT INTO titles (title, content_rating) VALUES ('Weapons', 'R')")
      .run().lastInsertRowid;
    assert.equal(
      db.prepare('SELECT content_rating FROM titles WHERE id = ?').get(id).content_rating,
      'R'
    );
    db.close();
  });

  it('is optional — plenty of titles legitimately have no certificate', () => {
    const db = createTestDb();
    const id = db.prepare("INSERT INTO titles (title) VALUES ('Home video')").run().lastInsertRowid;
    assert.equal(
      db.prepare('SELECT content_rating FROM titles WHERE id = ?').get(id).content_rating,
      null
    );
    db.close();
  });
});
