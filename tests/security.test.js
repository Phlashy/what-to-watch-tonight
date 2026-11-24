const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const express = require('../server/node_modules/express');
const { requireAuth } = require('../server/lib/auth');
const { rateLimit } = require('../server/lib/rate-limit');
const { notify } = require('../server/lib/notify');

function appWith(middleware) {
  const app = express();
  app.use(express.json());
  app.use(middleware);
  app.get('/x', (req, res) => res.json({ ok: true }));
  return app;
}

describe('requireAuth (optional shared password)', () => {
  it('passes through when no password is configured (default)', async () => {
    const res = await request(appWith(requireAuth(undefined))).get('/x');
    assert.equal(res.status, 200);
  });

  it('401 when a password is set but none is provided', async () => {
    const res = await request(appWith(requireAuth('s3cret'))).get('/x');
    assert.equal(res.status, 401);
  });

  it('401 on a wrong password', async () => {
    const res = await request(appWith(requireAuth('s3cret')))
      .get('/x')
      .set('x-app-password', 'nope');
    assert.equal(res.status, 401);
  });

  it('200 with the correct x-app-password header', async () => {
    const res = await request(appWith(requireAuth('s3cret')))
      .get('/x')
      .set('x-app-password', 's3cret');
    assert.equal(res.status, 200);
  });

  it('200 with a correct Authorization: Bearer token', async () => {
    const res = await request(appWith(requireAuth('s3cret')))
      .get('/x')
      .set('Authorization', 'Bearer s3cret');
    assert.equal(res.status, 200);
  });
});

/**
 * An app that believes X-Forwarded-For, so each test can pretend to be a
 * different visitor. (Without it every test request comes from loopback, which
 * the limiter deliberately never locks out.)
 */
function gatedApp(options) {
  const app = express();
  app.set('trust proxy', true);
  app.use(requireAuth('s3cret', options));
  app.get('/x', (req, res) => res.json({ ok: true }));
  return app;
}
const STRANGER = '203.0.113.5';
const FAMILY = '198.51.100.7';
const guess = (app, ip, password) => {
  const req = request(app).get('/x');
  if (ip) req.set('X-Forwarded-For', ip);
  if (password) req.set('x-app-password', password);
  return req;
};

describe('requireAuth wrong-password handling', () => {
  it('tells a wrong password apart from no password', async () => {
    const app = gatedApp();
    const none = await guess(app, STRANGER);
    assert.equal(none.status, 401);
    assert.equal(none.body.code, undefined);

    const wrong = await guess(app, STRANGER, 'nope');
    assert.equal(wrong.status, 401);
    assert.equal(wrong.body.code, 'wrong_password');
    assert.match(wrong.body.error, /wrong password/i);
  });

  it('locks an address out after maxFailures wrong guesses — even with the right password', async () => {
    const app = gatedApp({ maxFailures: 3, windowMs: 60000 });
    assert.equal((await guess(app, STRANGER, 'a')).status, 401);
    assert.equal((await guess(app, STRANGER, 'b')).status, 401);

    const third = await guess(app, STRANGER, 'c');
    assert.equal(third.status, 429);
    assert.equal(third.body.code, 'locked_out');
    assert.match(third.body.error, /too many wrong passwords/i);
    assert.ok(Number(third.headers['retry-after']) > 0);

    // Guess #4 is correct, but must not get in: the lockout is the whole point.
    assert.equal((await guess(app, STRANGER, 's3cret')).status, 429);
  });

  it('does not lock out anyone else', async () => {
    const app = gatedApp({ maxFailures: 2, windowMs: 60000 });
    await guess(app, STRANGER, 'a');
    await guess(app, STRANGER, 'b');
    assert.equal((await guess(app, STRANGER, 's3cret')).status, 429);
    assert.equal((await guess(app, FAMILY, 's3cret')).status, 200);
  });

  it('does not count requests that send no password', async () => {
    const app = gatedApp({ maxFailures: 2, windowMs: 60000 });
    for (let i = 0; i < 5; i++) assert.equal((await guess(app, STRANGER)).status, 401);
    assert.equal((await guess(app, STRANGER, 's3cret')).status, 200);
  });

  it('lets the address back in once the window has passed', async () => {
    let clock = 1_000_000;
    const app = gatedApp({ maxFailures: 2, windowMs: 60000, now: () => clock });
    await guess(app, STRANGER, 'a');
    await guess(app, STRANGER, 'b');
    assert.equal((await guess(app, STRANGER, 's3cret')).status, 429);

    clock += 59_000;
    assert.equal((await guess(app, STRANGER, 's3cret')).status, 429);
    clock += 2_000;
    assert.equal((await guess(app, STRANGER, 's3cret')).status, 200);
    // ...and the count started again from zero.
    assert.equal((await guess(app, STRANGER, 'a')).body.code, 'wrong_password');
  });

  it('fires onLockout exactly once per window, and onFailure on every wrong guess', async () => {
    const lockouts = [];
    const failures = [];
    const app = gatedApp({
      maxFailures: 3,
      windowMs: 60000,
      onLockout: (info) => lockouts.push(info),
      onFailure: (info) => failures.push(info),
    });
    for (let i = 0; i < 6; i++) await guess(app, STRANGER, 'nope');

    assert.deepEqual(lockouts, [{ ip: STRANGER, count: 3, windowMs: 60000, blocked: true }]);
    // Guesses 4-6 were refused unchecked, so they never reached the counter.
    assert.deepEqual(
      failures.map((f) => f.count),
      [1, 2, 3]
    );
  });

  it('never locks out a visitor it cannot identify (loopback), but still raises the alert', async () => {
    const lockouts = [];
    const app = gatedApp({
      maxFailures: 3,
      windowMs: 60000,
      onLockout: (info) => lockouts.push(info),
    });
    // No X-Forwarded-For: the request appears to come from this machine.
    for (let i = 0; i < 5; i++) {
      assert.equal((await guess(app, null, 'nope')).status, 401);
    }
    assert.equal((await guess(app, null, 's3cret')).status, 200);
    assert.equal(lockouts.length, 1);
    assert.equal(lockouts[0].blocked, false);
  });
});

describe('notify (ntfy push alerts)', () => {
  const alert = { title: 'Movie Night - test', message: 'hello', priority: 'high', tags: 'x' };

  it('does nothing when no topic is configured', async () => {
    let called = false;
    const sent = await notify(alert, {
      topic: '',
      fetchImpl: async () => {
        called = true;
      },
    });
    assert.equal(sent, false);
    assert.equal(called, false);
  });

  it('posts the alert to the configured topic', async () => {
    const calls = [];
    const sent = await notify(alert, {
      topic: 'my-topic',
      fetchImpl: async (url, init) => {
        calls.push({ url, init });
        return { ok: true };
      },
    });
    assert.equal(sent, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://ntfy.sh/my-topic');
    assert.equal(calls[0].init.method, 'POST');
    assert.equal(calls[0].init.body, 'hello');
    assert.deepEqual(calls[0].init.headers, {
      Title: 'Movie Night - test',
      Priority: 'high',
      Tags: 'x',
    });
  });

  it('never throws when ntfy is unreachable', async () => {
    const realError = console.error;
    console.error = () => {};
    try {
      const sent = await notify(alert, {
        topic: 'my-topic',
        fetchImpl: async () => {
          throw new Error('network down');
        },
      });
      assert.equal(sent, false);
    } finally {
      console.error = realError;
    }
  });
});

describe('rateLimit', () => {
  it('allows up to max requests then returns 429', async () => {
    const app = appWith(rateLimit({ windowMs: 60000, max: 3 }));
    for (let i = 0; i < 3; i++) {
      assert.equal((await request(app).get('/x')).status, 200);
    }
    const limited = await request(app).get('/x');
    assert.equal(limited.status, 429);
    assert.match(limited.body.error, /too many/i);
  });
});
