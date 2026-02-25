#!/usr/bin/env node
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const os = require('os');

function expandPath(p) {
  return p.replace(/^~/, os.homedir());
}

const dbPath = expandPath(process.env.DB_PATH || path.join(os.homedir(), 'movie-night-data', 'movies.db'));
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Run migrations
const migrationSql = fs.readFileSync(path.join(__dirname, '../server/migrations/001_initial.sql'), 'utf8');
db.exec(migrationSql);

const seedData = require('./final_consolidated.json');

// ─── Lists ────────────────────────────────────────────────────────────────────
const listDefs = [
  { name: 'family_to_watch',    display_name: 'Family Movie Night', description: 'Friday night family picks' },
  { name: 'with_nupur',         display_name: 'Me + Nupur',         description: 'For watching with Nupur' },
  { name: 'adult_movies',       display_name: 'Adult Movies',       description: 'Movies for adult viewing' },
  { name: 'adult_shows',        display_name: 'Adult Shows',        description: 'Shows for adult viewing' },
  { name: 'solo_gordon',        display_name: 'Solo Gordon',        description: 'Gordon solo picks' },
  { name: 'arianne_100_family', display_name: "Arianne's 100",      description: "Arianne's family movie project" },
  { name: 'davin_gordon_shows', display_name: 'Me + Davin',         description: 'Shows to watch with Davin' },
  { name: 'christmas',          display_name: 'Christmas',          description: 'Christmas picks' },
  { name: 'casey_brothers_recs',display_name: 'Casey Brothers',     description: 'Recs from the Casey brothers' },
];

const insertList = db.prepare('INSERT OR IGNORE INTO lists (name, display_name, description) VALUES (?, ?, ?)');
for (const l of listDefs) insertList.run(l.name, l.display_name, l.description);
console.log(`✓ Lists (${listDefs.length})`);

// ─── People ───────────────────────────────────────────────────────────────────
const peopleDefs = [
  { name: 'Gordon',  display_name: 'Gordon',  aliases: '["Gordon"]' },
  { name: 'Nupur',   display_name: 'Nupur',   aliases: '["Nupur","Mitu","Mummy","Mum"]' },
  { name: 'Arianne', display_name: 'Arianne', aliases: '["Arianne","Ari"]' },
  { name: 'Davin',   display_name: 'Davin',   aliases: '["Davin"]' },
  { name: 'Julian',  display_name: 'Julian',  aliases: '["Julian"]' },
];
const insertPerson = db.prepare('INSERT OR IGNORE INTO people (name, display_name, aliases) VALUES (?, ?, ?)');
for (const p of peopleDefs) insertPerson.run(p.name, p.display_name, p.aliases);
console.log(`✓ People (${peopleDefs.length})`);

// ─── Collect unique titles ────────────────────────────────────────────────────
const allWatched = [...seedData.watched, ...seedData.additional_watched];
const allToWatch = seedData.to_watch;

// Map: lowercase title → { title, type }
const titleMap = new Map();

for (const entry of allWatched) {
  const key = entry.title.trim().toLowerCase();
  if (!titleMap.has(key)) titleMap.set(key, { title: entry.title.trim(), type: 'movie' });
}

for (const entry of allToWatch) {
  const key = entry.title.trim().toLowerCase();
  const type = entry.type === 'show' ? 'show' : 'movie';
  if (!titleMap.has(key)) {
    titleMap.set(key, { title: entry.title.trim(), type });
  } else if (type === 'show') {
    titleMap.get(key).type = 'show'; // upgrade if more specific
  }
}

// ─── Insert titles ────────────────────────────────────────────────────────────
const insertTitle = db.prepare('INSERT OR IGNORE INTO titles (title, title_raw, type) VALUES (?, ?, ?)');
const insertTitleTx = db.transaction(() => {
  for (const [, info] of titleMap) {
    insertTitle.run(info.title, info.title, info.type);
  }
});
insertTitleTx();
console.log(`✓ Titles (${titleMap.size} unique)`);

// Build reverse lookup: lowercase title → id
const titleIdCache = new Map();
for (const row of db.prepare('SELECT id, title FROM titles').all()) {
  titleIdCache.set(row.title.trim().toLowerCase(), row.id);
}

function getTitleId(t) {
  return titleIdCache.get(t.trim().toLowerCase()) || null;
}

// ─── Viewings ─────────────────────────────────────────────────────────────────
const insertViewing = db.prepare(
  'INSERT INTO viewings (title_id, date, date_precision, rating, notes, tags) VALUES (?, ?, ?, ?, ?, ?)'
);
const insertVP = db.prepare(
  'INSERT INTO viewing_people (viewing_id, person, role) VALUES (?, ?, ?)'
);

const insertViewingsTx = db.transaction(() => {
  let count = 0;
  for (const entry of allWatched) {
    const titleId = getTitleId(entry.title);
    if (!titleId) { console.warn(`  ! No title found: "${entry.title}"`); continue; }

    const notes = seedData.reviews[entry.title] || null;
    const tags = JSON.stringify(entry.tags || []);
    const res = insertViewing.run(titleId, entry.date || null, entry.date_precision || 'unknown', entry.rating || null, notes, tags);
    const viewingId = res.lastInsertRowid;

    const choosers = (entry.chosen_by || []).filter(Boolean);
    for (const person of choosers) {
      insertVP.run(viewingId, person, 'chooser');
    }

    // For family movie nights, add the whole family as viewers
    if ((entry.tags || []).includes('family_movie_night')) {
      for (const member of ['Gordon', 'Nupur', 'Arianne', 'Davin']) {
        if (!choosers.includes(member)) {
          insertVP.run(viewingId, member, 'viewer');
        }
      }
    }
    count++;
  }
  return count;
});

const viewingCount = insertViewingsTx();
console.log(`✓ Viewings (${viewingCount})`);

// ─── List items ───────────────────────────────────────────────────────────────
const listIdCache = new Map();
for (const row of db.prepare('SELECT id, name FROM lists').all()) {
  listIdCache.set(row.name, row.id);
}

const insertListItem = db.prepare(
  'INSERT OR IGNORE INTO list_items (list_id, title_id, streaming_service, source, note, added_by) VALUES (?, ?, ?, ?, ?, ?)'
);

const insertListsTx = db.transaction(() => {
  let count = 0;
  for (const entry of allToWatch) {
    const titleId = getTitleId(entry.title);
    const listId = listIdCache.get(entry.list);
    if (!titleId) { console.warn(`  ! No title for list item: "${entry.title}"`); continue; }
    if (!listId) { console.warn(`  ! No list: "${entry.list}"`); continue; }

    insertListItem.run(listId, titleId, entry.streaming || null, entry.source || null, entry.note || null, entry.for || null);
    count++;
  }
  return count;
});

const listItemCount = insertListsTx();
console.log(`✓ List items (${listItemCount})`);

// ─── Summary ──────────────────────────────────────────────────────────────────
const stats = {
  titles: db.prepare('SELECT COUNT(*) as n FROM titles').get().n,
  viewings: db.prepare('SELECT COUNT(*) as n FROM viewings').get().n,
  listItems: db.prepare('SELECT COUNT(*) as n FROM list_items').get().n,
};

console.log(`\nDatabase: ${dbPath}`);
console.log(`  Titles:     ${stats.titles}`);
console.log(`  Viewings:   ${stats.viewings}`);
console.log(`  List items: ${stats.listItems}`);
console.log('\nImport complete! Run "npm run enrich" to fetch TMDB metadata.');

db.close();
