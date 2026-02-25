require('dotenv').config({ path: require('path').join(__dirname, '../.env'), override: true });

const express = require('express');
const cors = require('cors');
const os = require('os');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/titles', require('./routes/titles'));
app.use('/api/viewings', require('./routes/viewings'));
app.use('/api/lists', require('./routes/lists'));
app.use('/api/tmdb', require('./routes/tmdb'));
app.use('/api/shortlists', require('./routes/shortlists'));
app.use('/api/collection', require('./routes/collection'));
app.use('/api/chat', require('./routes/chat'));

// What to watch endpoint
app.get('/api/what-to-watch/:context', (req, res) => {
  const db = require('./db');
  const { context } = req.params;

  const contextListMap = {
    family: ['family_to_watch'],
    nupur: ['with_nupur', 'adult_movies'],
    arianne: ['arianne_100_family'],
    davin: ['davin_gordon_shows'],
    solo: ['solo_gordon', 'casey_brothers_recs', 'adult_shows'],
    christmas: ['christmas'],
  };

  const listNames = contextListMap[context];
  if (!listNames) return res.status(400).json({ error: 'Unknown context' });

  const placeholders = listNames.map(() => '?').join(',');
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);
  const cutoffDate = twelveMonthsAgo.toISOString().split('T')[0];

  let query = `
    SELECT
      t.id, t.title, t.year, t.director, t.genre, t.runtime_minutes,
      t.poster_url, t.synopsis, t.type, t.cast, t.watch_providers,
      li.id as list_item_id, li.streaming_service, li.source, li.note, li.added_at, li.added_by,
      l.name as list_name, l.display_name as list_display_name,
      (SELECT MAX(v.date) FROM viewings v WHERE v.title_id = t.id) as last_watched,
      (SELECT COUNT(*) FROM viewings v WHERE v.title_id = t.id) as view_count,
      (SELECT json_group_array(s.person) FROM shortlists s WHERE s.title_id = t.id AND s.context = '${context}') as shortlisted_by,
      (SELECT json_group_array(json_object('format', c.format, 'platform', c.platform)) FROM collection c WHERE c.title_id = t.id) as collection_entries
    FROM list_items li
    JOIN lists l ON li.list_id = l.id
    JOIN titles t ON li.title_id = t.id
    WHERE l.name IN (${placeholders})
  `;

  if (context === 'family') {
    query += `
      AND NOT EXISTS (
        SELECT 1 FROM viewings v
        WHERE v.title_id = t.id
        AND v.date >= '${cutoffDate}'
      )
    `;
  }

  query += ' ORDER BY li.priority ASC, li.added_at ASC';

  const items = db.prepare(query).all(...listNames);
  res.json(items);
});

const ROTATION = ['Davin', 'Arianne', 'Nupur', 'Gordon'];

function getRotationState(db) {
  const override = db.prepare("SELECT value FROM settings WHERE key = 'family_rotation_next_override'").get();
  const lastChooser = db.prepare(`
    SELECT vp.person
    FROM viewings v
    JOIN viewing_people vp ON v.id = vp.viewing_id
    WHERE v.tags LIKE '%family_movie_night%'
    AND vp.role = 'chooser'
    AND v.date IS NOT NULL
    ORDER BY v.date DESC
    LIMIT 1
  `).get();

  let nextChooser;
  let skipped = false;
  if (override) {
    nextChooser = override.value;
    skipped = true;
  } else if (lastChooser) {
    const idx = ROTATION.indexOf(lastChooser.person);
    nextChooser = ROTATION[(idx + 1) % ROTATION.length];
  } else {
    nextChooser = ROTATION[0];
  }

  return { nextChooser, rotation: ROTATION, lastChooser: lastChooser?.person || null, skipped };
}

// Family rotation endpoint
app.get('/api/family-rotation', (req, res) => {
  const db = require('./db');
  res.json(getRotationState(db));
});

// Skip a turn
app.post('/api/family-rotation/skip', (req, res) => {
  const db = require('./db');
  const { nextChooser } = getRotationState(db);
  const idx = ROTATION.indexOf(nextChooser);
  const skippedTo = ROTATION[(idx + 1) % ROTATION.length];
  db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('family_rotation_next_override', ?, CURRENT_TIMESTAMP)").run(skippedTo);
  res.json(getRotationState(db));
});

// Clear skip override (called automatically when a family viewing is logged)
app.delete('/api/family-rotation/skip', (req, res) => {
  const db = require('./db');
  db.prepare("DELETE FROM settings WHERE key = 'family_rotation_next_override'").run();
  res.json(getRotationState(db));
});

// Stats endpoint
app.get('/api/stats', (req, res) => {
  const db = require('./db');

  const totalWatched = db.prepare('SELECT COUNT(*) as count FROM viewings').get();
  const totalTitles = db.prepare('SELECT COUNT(*) as count FROM titles').get();
  const totalToWatch = db.prepare('SELECT COUNT(*) as count FROM list_items').get();
  const recentWatched = db.prepare(`
    SELECT t.title, v.date, v.rating
    FROM viewings v JOIN titles t ON v.title_id = t.id
    WHERE v.date IS NOT NULL
    ORDER BY v.date DESC LIMIT 5
  `).all();

  res.json({
    totalWatched: totalWatched.count,
    totalTitles: totalTitles.count,
    totalToWatch: totalToWatch.count,
    recentWatched,
  });
});

// Serve client in production
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '../client/dist');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist, { maxAge: '1y', immutable: true }));
    app.get('*', (req, res) => {
      res.set('Cache-Control', 'no-cache');
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }
}

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
