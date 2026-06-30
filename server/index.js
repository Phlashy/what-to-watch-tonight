require('dotenv').config({ path: require('path').join(__dirname, '../.env'), override: true });

const express = require('express');
const cors = require('cors');
const os = require('os');
const path = require('path');
const fs = require('fs');

// Load family config (fall back to example if personal config doesn't exist)
const configPath = path.join(__dirname, '../family.config.json');
const exampleConfigPath = path.join(__dirname, '../family.config.example.json');
const familyConfig = JSON.parse(
  fs.readFileSync(fs.existsSync(configPath) ? configPath : exampleConfigPath, 'utf8')
);

// Build context→lists map from config
const contextListMap = {};
for (const ctx of familyConfig.contexts) {
  contextListMap[ctx.id] = ctx.lists;
}

const app = express();
const PORT = process.env.PORT || 3001;

// Behind Nginx on the Pi, requests arrive from 127.0.0.1 — trust loopback
// proxies so req.ip is the real client address (used by the chat rate limit).
app.set('trust proxy', 'loopback');

app.locals.familyConfig = familyConfig;
app.locals.contextListMap = contextListMap;
// Inject the database via app.locals so route handlers read `req.app.locals.db`.
// In production this is the real singleton; tests mount the same routers against
// an in-memory database, so the tests exercise the real handler code.
app.locals.db = require('./db');

// CORS: permissive by default (LAN use). Set CORS_ORIGIN to a comma-separated
// allowlist to restrict (e.g. for an internet-exposed deployment).
const corsOrigin = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim())
  : true;
app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: '256kb' }));
app.use(require('./lib/validate').limitBodyStrings);

// Health check endpoint (always open, for monitoring)
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Optional shared-password auth on the whole API (off unless APP_PASSWORD is set).
app.use('/api', require('./lib/auth').requireAuth(process.env.APP_PASSWORD));

// Rate-limit the chat endpoint (it calls the paid Anthropic API).
app.use('/api/chat', require('./lib/rate-limit').rateLimit({ windowMs: 60000, max: 20 }));

// Family config endpoint
app.get('/api/config', (req, res) => res.json(familyConfig));

// Routes
app.use('/api/titles', require('./routes/titles'));
app.use('/api/viewings', require('./routes/viewings'));
app.use('/api/lists', require('./routes/lists'));
app.use('/api/tmdb', require('./routes/tmdb'));
app.use('/api/ratings', require('./routes/ratings'));
app.use('/api/shortlists', require('./routes/shortlists'));
app.use('/api/collection', require('./routes/collection'));
app.use('/api/chat', require('./routes/chat').router);
app.use('/api/what-to-watch', require('./routes/what-to-watch'));
app.use('/api/family-rotation', require('./routes/rotation').router);
app.use('/api/stats', require('./routes/stats'));
app.use('/api/show-status', require('./routes/show-status'));

// JSON 404 for any unmatched API route (so the client always gets {error}, not HTML).
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Serve client in production
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '../client/dist');
  if (fs.existsSync(clientDist)) {
    // Hashed JS/CSS/image assets: cache forever (filenames change on rebuild)
    // index.html, sw.js, manifest.json: never cache (must always be fresh)
    app.use(
      express.static(clientDist, {
        maxAge: '1y',
        immutable: true,
        index: false, // don't auto-serve index.html — let the catch-all handle it with no-cache
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('sw.js') || filePath.endsWith('manifest.json')) {
            res.set('Cache-Control', 'no-cache');
          } else if (filePath.includes(`${path.sep}icons${path.sep}`)) {
            // Icons aren't content-hashed, so don't cache them for a year.
            res.set('Cache-Control', 'public, max-age=86400');
          }
        },
      })
    );
    app.get('*', (req, res) => {
      res.set('Cache-Control', 'no-cache');
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }
}

// Global error handler — must be last. Guarantees a JSON response (never an HTML
// stack page) so the client's api.js can always surface a useful message. Logs
// the full error server-side; hides internal details from clients in production.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(`Error on ${req.method} ${req.originalUrl}:`, err);
  const status = err.status || err.statusCode || 500;
  const message =
    status >= 500 && process.env.NODE_ENV === 'production'
      ? 'Something went wrong on the server.'
      : err.message || 'Internal Server Error';
  res.status(status).json({ error: message });
});

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

app.listen(PORT, '0.0.0.0', () => {
  const localIP = getLocalIP();
  console.log(`\n🎬 Movie Night server running`);
  console.log(`   Local:   http://localhost:${PORT}`);
  console.log(`   Network: http://${localIP}:${PORT}`);
  console.log('');
});
