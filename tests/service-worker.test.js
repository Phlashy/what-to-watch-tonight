const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// The service worker runs in the browser, so these tests load the file into a
// sandbox with a fake Cache Storage and fire its lifecycle events by hand.
//
// Why this matters: Cache Storage is shared by every app on the same web
// address. This app shares anguspi with others (e.g. the care site at
// /colette/), so the worker must only ever tidy up caches it created itself.

const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(ROOT, 'client/public/sw.js');
const BUILT = path.join(ROOT, 'client/dist/sw.js');

function loadWorker(file, existingCacheNames) {
  const store = new Set(existingCacheNames);
  const listeners = {};
  const sandbox = {
    self: {
      addEventListener: (type, fn) => (listeners[type] = fn),
      skipWaiting: () => Promise.resolve(),
      clients: { claim: () => Promise.resolve() },
    },
    caches: {
      keys: () => Promise.resolve([...store]),
      delete: (k) => Promise.resolve(store.delete(k)),
      open: (k) => {
        store.add(k);
        return Promise.resolve({ add: () => Promise.resolve(), put: () => Promise.resolve() });
      },
      match: () => Promise.resolve(undefined),
    },
    fetch: () => Promise.reject(new Error('offline')),
  };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });

  async function fire(type) {
    let pending;
    listeners[type]({ waitUntil: (p) => (pending = p) });
    await pending;
  }
  return { store, fire };
}

for (const [label, file] of [
  ['source (client/public/sw.js)', SOURCE],
  ['built copy (client/dist/sw.js)', BUILT],
]) {
  describe(`service worker cache cleanup: ${label}`, () => {
    it("leaves other apps' caches alone when it activates", async () => {
      const others = ['colette-shell-v7', 'legs-sleep-log-v2', 'some-other-app'];
      const { store, fire } = loadWorker(file, others);
      await fire('install');
      await fire('activate');
      for (const name of others) {
        assert.ok(store.has(name), `activate deleted another app's cache: ${name}`);
      }
    });

    it('removes its own old caches and keeps the current one', async () => {
      const { store, fire } = loadWorker(file, ['movie-night-v0', 'movie-night-v1']);
      await fire('install');
      const current = [...store].filter((k) => !['movie-night-v0', 'movie-night-v1'].includes(k));
      assert.equal(current.length, 1, 'install should open exactly one new cache');
      await fire('activate');
      assert.deepEqual([...store], current);
      assert.match(current[0], /^movie-night-/);
    });
  });
}

describe('service worker: committed bundle', () => {
  it('built copy is identical to the source', () => {
    assert.equal(fs.readFileSync(BUILT, 'utf8'), fs.readFileSync(SOURCE, 'utf8'));
  });
});
