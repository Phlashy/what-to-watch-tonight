CREATE TABLE IF NOT EXISTS titles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  title_raw TEXT,
  type TEXT DEFAULT 'movie',
  tmdb_id INTEGER,
  year INTEGER,
  director TEXT,
  cast TEXT,
  genre TEXT,
  runtime_minutes INTEGER,
  poster_url TEXT,
  synopsis TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS viewings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title_id INTEGER REFERENCES titles(id),
  date TEXT,
  date_precision TEXT DEFAULT 'day',
  rating INTEGER,
  notes TEXT,
  tags TEXT DEFAULT '[]',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS viewing_people (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  viewing_id INTEGER REFERENCES viewings(id),
  person TEXT NOT NULL,
  role TEXT DEFAULT 'chooser'
);

CREATE TABLE IF NOT EXISTS lists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  display_name TEXT,
  description TEXT
);

CREATE TABLE IF NOT EXISTS list_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  list_id INTEGER REFERENCES lists(id),
  title_id INTEGER REFERENCES titles(id),
  streaming_service TEXT,
  source TEXT,
  note TEXT,
  priority INTEGER,
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(list_id, title_id)
);

CREATE TABLE IF NOT EXISTS people (
  name TEXT PRIMARY KEY,
  display_name TEXT,
  aliases TEXT DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS shortlists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title_id INTEGER REFERENCES titles(id),
  person TEXT NOT NULL,
  context TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(title_id, person, context)
);

CREATE INDEX IF NOT EXISTS idx_viewings_title_id ON viewings(title_id);
CREATE INDEX IF NOT EXISTS idx_viewings_date ON viewings(date);
CREATE INDEX IF NOT EXISTS idx_viewing_people_viewing_id ON viewing_people(viewing_id);
CREATE INDEX IF NOT EXISTS idx_list_items_list_id ON list_items(list_id);
CREATE INDEX IF NOT EXISTS idx_list_items_title_id ON list_items(title_id);
CREATE INDEX IF NOT EXISTS idx_shortlists_context ON shortlists(context);
