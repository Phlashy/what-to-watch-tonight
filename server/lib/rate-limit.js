/**
 * Tiny in-memory fixed-window rate limiter (no dependency) — suitable for a
 * single-process self-hosted app. Keyed by client IP. Used to cap the chat
 * endpoint, which calls the paid Anthropic API.
 */
function rateLimit({ windowMs = 60000, max = 20 } = {}) {
  const hits = new Map(); // ip -> { count, resetAt }

  return (req, res, next) => {
    const now = Date.now();
    // Sweep expired windows once the map grows, so it can't expand unbounded.
    if (hits.size > 500) {
      for (const [key, value] of hits) {
        if (now >= value.resetAt) hits.delete(key);
      }
    }
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';

    let entry = hits.get(ip);
    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(ip, entry);
    }
    entry.count += 1;

    if (entry.count > max) {
      res.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      return res.status(429).json({ error: 'Too many requests — slow down a moment.' });
    }
    next();
  };
}

module.exports = { rateLimit };
