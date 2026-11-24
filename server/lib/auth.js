/**
 * Optional shared-password authentication.
 *
 * Off by default: if no password is configured (APP_PASSWORD unset), every
 * request passes — preserving the zero-friction LAN experience. When a self-
 * hoster sets a password, API requests must present it via the `x-app-password`
 * header or `Authorization: Bearer <password>`.
 *
 * Wrong guesses are counted per client address. After `maxFailures` wrong
 * guesses inside one window that address is locked out until the window ends,
 * and `onLockout` fires once (the server uses it to send a push alert).
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
 * True when the address is this machine itself. Behind a reverse proxy that
 * doesn't pass the visitor's address along, EVERY visitor looks like loopback —
 * so a loopback address means "we can't tell visitors apart".
 */
function isLoopback(ip) {
  return ip === '::1' || ip.startsWith('127.') || ip.startsWith('::ffff:127.');
}

/**
 * Build the auth middleware for a given password.
 * @param {string|undefined} password - the shared secret; falsy disables auth.
 * @param {object} [options]
 * @param {number} [options.maxFailures=20] - wrong guesses allowed per window.
 * @param {number} [options.windowMs=3600000] - window length (default 1 hour),
 *   counted from an address's first wrong guess.
 * @param {(info: {ip: string, count: number}) => void} [options.onFailure] -
 *   called on every wrong guess.
 * @param {(info: {ip: string, count: number, windowMs: number, blocked: boolean}) => void} [options.onLockout] -
 *   called once per window when an address reaches `maxFailures`.
 * @param {() => number} [options.now] - clock, injectable for tests.
 */
function requireAuth(password, options = {}) {
  const {
    maxFailures = 20,
    windowMs = 60 * 60 * 1000,
    onFailure = () => {},
    onLockout = () => {},
    now = Date.now,
  } = options;
  const failures = new Map(); // ip -> { count, resetAt }

  const lockedOut = (res, entry, time) => {
    const seconds = Math.max(1, Math.ceil((entry.resetAt - time) / 1000));
    const minutes = Math.ceil(seconds / 60);
    res.set('Retry-After', String(seconds));
    return res.status(429).json({
      error: `Too many wrong passwords. Try again in about ${minutes} minute${minutes === 1 ? '' : 's'}.`,
      code: 'locked_out',
    });
  };

  return (req, res, next) => {
    if (!password) return next(); // auth disabled (default)

    const time = now();
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    // Never lock out an address we can't tell apart from everyone else's:
    // one person's typos (or one stranger) would lock out the whole household.
    // Those guesses are still counted and still raise the alert.
    const canBlock = !isLoopback(ip);

    let entry = failures.get(ip);
    if (entry && time >= entry.resetAt) {
      failures.delete(ip);
      entry = undefined;
    }

    // Locked out: refuse without even checking the password, otherwise the
    // limit wouldn't stop anyone from carrying on guessing.
    if (entry && canBlock && entry.count >= maxFailures) return lockedOut(res, entry, time);

    const provided =
      req.get('x-app-password') || (req.get('authorization') || '').replace(/^Bearer\s+/i, '');

    // No password sent at all (a first visit) is not a guess — don't count it.
    if (!provided) {
      res.set('WWW-Authenticate', 'Bearer');
      return res.status(401).json({ error: 'Authentication required.' });
    }

    if (safeEqual(provided, password)) return next();

    // A wrong guess. Sweep expired windows once the map grows, so it can't
    // expand unbounded.
    if (failures.size > 500) {
      for (const [key, value] of failures) {
        if (time >= value.resetAt) failures.delete(key);
      }
    }
    if (!entry) {
      entry = { count: 0, resetAt: time + windowMs };
      failures.set(ip, entry);
    }
    entry.count += 1;
    onFailure({ ip, count: entry.count });

    if (entry.count === maxFailures) {
      onLockout({ ip, count: entry.count, windowMs, blocked: canBlock });
    }
    if (canBlock && entry.count >= maxFailures) return lockedOut(res, entry, time);

    res.set('WWW-Authenticate', 'Bearer');
    return res.status(401).json({ error: 'Wrong password.', code: 'wrong_password' });
  };
}

module.exports = { requireAuth, safeEqual, isLoopback };
