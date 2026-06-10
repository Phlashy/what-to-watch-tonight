/**
 * Optional shared-password authentication.
 *
 * Off by default: if no password is configured (APP_PASSWORD unset), every
 * request passes — preserving the zero-friction LAN experience. When a self-
 * hoster sets a password, API requests must present it via the `x-app-password`
 * header or `Authorization: Bearer <password>`.
 */
const crypto = require('crypto');

/** Constant-time string comparison that tolerates differing lengths. */
function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * Build the auth middleware for a given password.
 * @param {string|undefined} password - the shared secret; falsy disables auth.
 */
function requireAuth(password) {
  return (req, res, next) => {
    if (!password) return next(); // auth disabled (default)
    const provided =
      req.get('x-app-password') || (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (provided && safeEqual(provided, password)) return next();
    res.set('WWW-Authenticate', 'Bearer');
    return res.status(401).json({ error: 'Authentication required.' });
  };
}

module.exports = { requireAuth, safeEqual };
