const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createTestDb, seedTestData } = require('./helpers');

// Exercise the REAL rotation core that both the /api/family-rotation route and
// the chat assistant's get_family_rotation tool now use — not a reimplementation.
const core = require('../server/lib/rotation');

const ROTATION = ['Davin', 'Arianne', 'Nupur', 'Gordon'];

describe('Family Rotation', () => {
  let db;

  before(() => {
    db = createTestDb();
    seedTestData(db);
  });

  beforeEach(() => {
    db.prepare('DELETE FROM settings').run();
  });

  it('defaults to first person in rotation when no setting exists', () => {
    assert.equal(core.getRotationState(db, ROTATION).nextChooser, 'Davin');
  });

  it('lastChooser is always the person before nextChooser in the rotation', () => {
    core.setNextChooser(db, 'Arianne');
    const state = core.getRotationState(db, ROTATION);
    assert.equal(state.nextChooser, 'Arianne');
    assert.equal(state.lastChooser, 'Davin');
  });

  it('lastChooser wraps around when nextChooser is the first person', () => {
    // Davin is next → lastChooser should be Gordon
    const state = core.getRotationState(db, ROTATION);
    assert.equal(state.nextChooser, 'Davin');
    assert.equal(state.lastChooser, 'Gordon');
  });

  describe('advanceRotation', () => {
    it('advances from Davin to Arianne', () => {
      core.advanceRotation(db, ROTATION); // no setting → defaults to Davin, then advances
      assert.equal(core.getNextChooser(db, ROTATION), 'Arianne');
    });

    it('advances from Arianne to Nupur', () => {
      core.setNextChooser(db, 'Arianne');
      core.advanceRotation(db, ROTATION);
      assert.equal(core.getNextChooser(db, ROTATION), 'Nupur');
    });

    it('advances from Nupur to Gordon', () => {
      core.setNextChooser(db, 'Nupur');
      core.advanceRotation(db, ROTATION);
      assert.equal(core.getNextChooser(db, ROTATION), 'Gordon');
    });

    it('wraps from Gordon back to Davin', () => {
      core.setNextChooser(db, 'Gordon');
      core.advanceRotation(db, ROTATION);
      assert.equal(core.getNextChooser(db, ROTATION), 'Davin');
    });

    it('advances regardless of who actually chose (tough luck rule)', () => {
      core.setNextChooser(db, 'Davin');
      core.advanceRotation(db, ROTATION); // simulates a family_movie_night viewing being logged
      assert.equal(core.getNextChooser(db, ROTATION), 'Arianne');
    });
  });

  describe('skip / undo', () => {
    it('skip advances rotation by one more step', () => {
      core.advanceRotation(db, ROTATION); // Davin → Arianne
      assert.equal(core.getNextChooser(db, ROTATION), 'Arianne');
    });

    it('undo skip (rewind) goes back one step', () => {
      core.setNextChooser(db, 'Arianne');
      core.rewindRotation(db, ROTATION);
      assert.equal(core.getNextChooser(db, ROTATION), 'Davin');
    });

    it('rewind wraps from Davin back to Gordon', () => {
      core.setNextChooser(db, 'Davin');
      core.rewindRotation(db, ROTATION);
      assert.equal(core.getNextChooser(db, ROTATION), 'Gordon');
    });
  });

  describe('single source of truth (regression for chat/Tonight divergence)', () => {
    it('getRotationState reflects whatever advanceRotation last persisted', () => {
      // The chat tool and the Tonight route both read getRotationState(db, …),
      // so advancing via one surface must be visible to the other.
      core.setNextChooser(db, 'Davin');
      core.advanceRotation(db, ROTATION); // e.g. a movie night logged → Arianne
      const state = core.getRotationState(db, ROTATION);
      assert.equal(state.nextChooser, 'Arianne');
      assert.equal(state.lastChooser, 'Davin');
    });
  });
});
