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

app.locals.familyConfig = familyConfig;
app.locals.contextListMap = contextListMap;

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Family config endpoint
app.get('/api/config', (req, res) => res.json(familyConfig));

// Routes
app.use('/api/titles', require('./routes/titles'));
app.use('/api/viewings', require('./routes/viewings'));
app.use('/api/lists', require('./routes/lists'));
app.use('/api/tmdb', require('./routes/tmdb'));
app.use('/api/shortlists', require('./routes/shortlists'));
app.use('/api/collection', require('./routes/collection'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/what-to-watch', require('./routes/what-to-watch'));
app.use('/api/family-rotation', require('./routes/rotation'));
app.use('/api/stats', require('./routes/stats'));

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
