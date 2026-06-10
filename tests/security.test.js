const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const express = require('../server/node_modules/express');
const { requireAuth } = require('../server/lib/auth');
const { rateLimit } = require('../server/lib/rate-limit');

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
