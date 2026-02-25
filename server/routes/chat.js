const express = require('express');
const router = express.Router();
const Anthropic = require('@anthropic-ai/sdk').default;
const db = require('../db');

const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY from env

const ROTATION = ['Davin', 'Arianne', 'Nupur', 'Gordon'];

// --- System prompt ---

function buildSystemPrompt(person) {
  return `You are the Movie Night Assistant for the Casey family. You're friendly, concise, and helpful.

The family members are: Gordon (dad), Nupur (mom), Arianne (daughter), Davin (son).
Family Movie Night rotation order: Davin → Arianne → Nupur → Gordon (repeats).

You are currently talking to: ${person || 'an unknown family member'}.
Today's date: ${new Date().toISOString().split('T')[0]}.

Lists in the system:
- family_to_watch: Family Movie Night watchlist
- with_nupur: Gordon & Nupur date night
- adult_movies: Adult movies (Gordon & Nupur)
- adult_shows: Adult TV shows
- solo_gordon: Solo Gordon watchlist
- arianne_100_family: Arianne's 100 family movies
- davin_gordon_shows: Davin & Gordon shows
- christmas: Christmas movies
- casey_brothers_recs: Casey brothers recommendations

CRITICAL RULES:
- You MUST use tools for EVERY question about the family's movies, shows, viewings, ratings, or lists. NEVER answer from your own knowledge.
- You know NOTHING about what this family has watched, rated, or owns. The ONLY source of truth is the tools.
- If asked about a director, actor, or genre — ALWAYS call search_titles first. Do not guess.
- If a search returns results, report ALL of them, not just some.
- If a search returns no results, say "I couldn't find any in the database" — never make claims about what exists or doesn't exist without checking.
- For "which director/genre have we watched the most" or similar aggregate/ranking questions, ALWAYS use get_top_directors or get_top_genres. These tools do the counting for you — never try to count from raw viewing data.
- You may use multiple tool calls to answer a single question if needed.

When you mention specific titles, format them as [[title_id:Title Name]] so the app can make them clickable links.
Keep responses conversational and concise. The family uses this on their phones on movie night, so don't write essays.`;
}

// --- Tool definitions ---

const tools = [
  {
    name: 'search_titles',
    description: 'Search for movies and TV shows by title, director, cast, genre, or type. Returns matching titles with basic info and view counts.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search text to match against title, director, cast, synopsis' },
        type: { type: 'string', enum: ['movie', 'show'], description: 'Filter by type' },
        genre: { type: 'string', description: 'Filter by genre (partial match)' },
        limit: { type: 'number', description: 'Max results (default 10)' },
      },
      required: [],
    },
  },
  {
    name: 'get_title_details',
    description: 'Get full details for a specific title by ID, including all viewings with per-person ratings, list memberships, and collection info.',
    input_schema: {
      type: 'object',
      properties: {
        title_id: { type: 'number', description: 'The title ID' },
      },
      required: ['title_id'],
    },
  },
  {
    name: 'get_viewing_history',
    description: 'Get viewing history with optional filters. Returns what the family has watched, when, and how they rated it.',
    input_schema: {
      type: 'object',
      properties: {
        person: { type: 'string', description: 'Filter by person name (Gordon, Nupur, Arianne, Davin)' },
        from_date: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
        to_date: { type: 'string', description: 'End date (YYYY-MM-DD)' },
        search: { type: 'string', description: 'Search by title name' },
        sort: { type: 'string', enum: ['date', 'rating'], description: 'Sort order: date (newest first, default) or rating (highest first)' },
        limit: { type: 'number', description: 'Max results (default 20)' },
      },
      required: [],
    },
  },
  {
    name: 'get_list_items',
    description: 'Get all items from a specific list. Use list name like "family_to_watch", "with_nupur", etc.',
    input_schema: {
      type: 'object',
      properties: {
        list_name: { type: 'string', description: 'Internal list name (e.g. family_to_watch, with_nupur, adult_movies, solo_gordon, christmas, etc.)' },
      },
      required: ['list_name'],
    },
  },
  {
    name: 'get_all_lists',
    description: 'Get all lists with their item counts.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_person_stats',
    description: 'Get watching statistics for a family member: total viewings, average rating, recent watches, favourite genres, and top-rated titles.',
    input_schema: {
      type: 'object',
      properties: {
        person: { type: 'string', description: 'Person name (Gordon, Nupur, Arianne, Davin)' },
      },
      required: ['person'],
    },
  },
  {
    name: 'get_top_directors',
    description: 'Get the most-watched directors, ranked by number of viewings. Use this for any question about directors the family has watched most, favourite directors, etc.',
    input_schema: {
      type: 'object',
      properties: {
        person: { type: 'string', description: 'Optional: filter to viewings by a specific person' },
        limit: { type: 'number', description: 'How many directors to return (default 10)' },
      },
      required: [],
    },
  },
  {
    name: 'get_top_genres',
    description: 'Get the most-watched genres, ranked by number of viewings. Use this for any question about favourite genres, what kind of movies the family watches, etc.',
    input_schema: {
      type: 'object',
      properties: {
        person: { type: 'string', description: 'Optional: filter to viewings by a specific person' },
        limit: { type: 'number', description: 'How many genres to return (default 10)' },
      },
      required: [],
    },
  },
  {
    name: 'get_family_rotation',
    description: 'Get the current family movie night rotation: whose turn it is to choose next, who chose last, and the full rotation order.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'add_to_list',
    description: 'Add a title to a list. Confirm with the user before calling this.',
    input_schema: {
      type: 'object',
      properties: {
        title_id: { type: 'number', description: 'Title ID to add' },
        list_name: { type: 'string', description: 'Internal list name' },
        added_by: { type: 'string', description: 'Person adding it (defaults to current user)' },
      },
      required: ['title_id', 'list_name'],
    },
  },
  {
    name: 'remove_from_list',
    description: 'Remove a title from a list. Confirm with the user before calling this.',
    input_schema: {
      type: 'object',
      properties: {
        title_id: { type: 'number', description: 'Title ID to remove' },
        list_name: { type: 'string', description: 'Internal list name' },
      },
      required: ['title_id', 'list_name'],
    },
  },
];

// --- Tool implementations ---

function toolSearchTitles({ query, type, genre, limit = 10 }) {
  let sql = `SELECT t.id, t.title, t.year, t.type, t.director, t.genre, t.runtime_minutes,
    (SELECT COUNT(*) FROM viewings v WHERE v.title_id = t.id) as view_count,
    (SELECT ROUND(AVG(r), 1) FROM (
      SELECT vp.rating as r FROM viewings v2 JOIN viewing_people vp ON v2.id = vp.viewing_id
      WHERE v2.title_id = t.id AND vp.rating IS NOT NULL
      UNION ALL
      SELECT v3.rating as r FROM viewings v3
      WHERE v3.title_id = t.id AND v3.rating IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM viewing_people vp2 WHERE vp2.viewing_id = v3.id AND vp2.rating IS NOT NULL)
    )) as avg_rating
    FROM titles t WHERE 1=1`;
  const params = [];
  if (query) {
    sql += ' AND (t.title LIKE ? OR t.director LIKE ? OR t.cast LIKE ? OR t.synopsis LIKE ?)';
    params.push(`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`);
  }
  if (type) { sql += ' AND t.type = ?'; params.push(type); }
  if (genre) { sql += ' AND t.genre LIKE ?'; params.push(`%${genre}%`); }
  sql += ' ORDER BY t.title ASC LIMIT ?';
  params.push(Math.min(limit, 50));
  return db.prepare(sql).all(...params);
}

function toolGetTitleDetails({ title_id }) {
  const title = db.prepare('SELECT * FROM titles WHERE id = ?').get(title_id);
  if (!title) return { error: 'Title not found' };
  const viewings = db.prepare(`
    SELECT v.id, v.date, v.date_precision, v.rating, v.notes, v.tags,
      json_group_array(json_object('person', vp.person, 'role', vp.role, 'rating', vp.rating)) as people
    FROM viewings v LEFT JOIN viewing_people vp ON v.id = vp.viewing_id
    WHERE v.title_id = ? GROUP BY v.id ORDER BY v.date DESC NULLS LAST
  `).all(title_id);
  const listMemberships = db.prepare(`
    SELECT l.name, l.display_name, li.added_by FROM list_items li JOIN lists l ON li.list_id = l.id WHERE li.title_id = ?
  `).all(title_id);
  const collection = db.prepare('SELECT format, platform, notes FROM collection WHERE title_id = ?').all(title_id);
  // Strip fields the LLM doesn't need to keep token count down
  return {
    id: title.id, title: title.title, year: title.year, type: title.type,
    director: title.director, genre: title.genre, runtime_minutes: title.runtime_minutes,
    synopsis: title.synopsis, cast: title.cast,
    viewings, listMemberships, collection,
  };
}

function toolGetViewingHistory({ person, from_date, to_date, search, sort, limit = 20 }) {
  let sql = `SELECT v.id, v.date, v.rating, v.notes, v.tags, t.id as title_id, t.title, t.year, t.type,
    json_group_array(json_object('person', vp.person, 'role', vp.role, 'rating', vp.rating)) as people
    FROM viewings v JOIN titles t ON v.title_id = t.id
    LEFT JOIN viewing_people vp ON v.id = vp.viewing_id WHERE 1=1`;
  const params = [];
  if (person) {
    sql += ' AND EXISTS (SELECT 1 FROM viewing_people vp2 WHERE vp2.viewing_id = v.id AND vp2.person = ?)';
    params.push(person);
  }
  if (from_date) { sql += ' AND v.date >= ?'; params.push(from_date); }
  if (to_date) { sql += ' AND v.date <= ?'; params.push(to_date); }
  if (search) { sql += ' AND t.title LIKE ?'; params.push(`%${search}%`); }
  sql += ' GROUP BY v.id';
  if (sort === 'rating') {
    sql += ' ORDER BY COALESCE((SELECT MAX(vp3.rating) FROM viewing_people vp3 WHERE vp3.viewing_id = v.id AND vp3.rating IS NOT NULL), v.rating) DESC NULLS LAST';
  } else {
    sql += ' ORDER BY v.date DESC NULLS LAST';
  }
  sql += ' LIMIT ?';
  params.push(Math.min(limit, 500));
  return db.prepare(sql).all(...params);
}

function toolGetListItems({ list_name }) {
  const list = db.prepare('SELECT * FROM lists WHERE name = ?').get(list_name);
  if (!list) return { error: `List "${list_name}" not found` };
  const items = db.prepare(`
    SELECT li.id as list_item_id, t.id as title_id, t.title, t.year, t.type, t.genre, t.director,
      li.streaming_service, li.note, li.added_by,
      (SELECT MAX(v.date) FROM viewings v WHERE v.title_id = t.id) as last_watched
    FROM list_items li JOIN titles t ON li.title_id = t.id
    WHERE li.list_id = ? ORDER BY li.priority ASC, li.added_at ASC
  `).all(list.id);
  return { list_name: list.name, display_name: list.display_name, item_count: items.length, items };
}

function toolGetAllLists() {
  return db.prepare(`
    SELECT l.name, l.display_name, l.description, COUNT(li.id) as item_count
    FROM lists l LEFT JOIN list_items li ON l.id = li.list_id GROUP BY l.id ORDER BY l.id ASC
  `).all();
}

function toolGetPersonStats({ person }) {
  const totalViewings = db.prepare(`
    SELECT COUNT(DISTINCT v.id) as count FROM viewings v
    JOIN viewing_people vp ON v.id = vp.viewing_id WHERE vp.person = ?
  `).get(person);

  const avgRating = db.prepare(`
    SELECT ROUND(AVG(vp.rating), 1) as avg FROM viewing_people vp WHERE vp.person = ? AND vp.rating IS NOT NULL
  `).get(person);

  const topRated = db.prepare(`
    SELECT t.id as title_id, t.title, t.year, vp.rating FROM viewings v
    JOIN titles t ON v.title_id = t.id JOIN viewing_people vp ON v.id = vp.viewing_id
    WHERE vp.person = ? AND vp.rating IS NOT NULL ORDER BY vp.rating DESC, v.date DESC LIMIT 10
  `).all(person);

  const recentWatches = db.prepare(`
    SELECT t.id as title_id, t.title, v.date, vp.rating FROM viewings v
    JOIN titles t ON v.title_id = t.id JOIN viewing_people vp ON v.id = vp.viewing_id
    WHERE vp.person = ? ORDER BY v.date DESC NULLS LAST LIMIT 5
  `).all(person);

  const genreRows = db.prepare(`
    SELECT t.genre FROM viewings v JOIN titles t ON v.title_id = t.id
    JOIN viewing_people vp ON v.id = vp.viewing_id WHERE vp.person = ? AND t.genre IS NOT NULL
  `).all(person);
  const genreCounts = {};
  for (const row of genreRows) {
    try {
      for (const g of JSON.parse(row.genre)) {
        genreCounts[g] = (genreCounts[g] || 0) + 1;
      }
    } catch {}
  }
  const topGenres = Object.entries(genreCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return {
    person,
    total_viewings: totalViewings.count,
    avg_rating: avgRating.avg,
    top_rated: topRated,
    recent_watches: recentWatches,
    top_genres: topGenres.map(([genre, count]) => ({ genre, count })),
  };
}

function toolGetTopDirectors({ person, limit = 10 }) {
  let sql = `SELECT t.director, COUNT(DISTINCT v.id) as view_count,
    GROUP_CONCAT(DISTINCT t.title) as titles
    FROM viewings v JOIN titles t ON v.title_id = t.id`;
  const params = [];
  if (person) {
    sql += " JOIN viewing_people vp ON v.id = vp.viewing_id WHERE vp.person = ? AND t.director IS NOT NULL AND t.director != ''";
    params.push(person);
  } else {
    sql += " WHERE t.director IS NOT NULL AND t.director != ''";
  }
  sql += ' GROUP BY t.director ORDER BY view_count DESC LIMIT ?';
  params.push(Math.min(limit, 30));
  return db.prepare(sql).all(...params);
}

function toolGetTopGenres({ person, limit = 10 }) {
  let sql = `SELECT t.genre FROM viewings v JOIN titles t ON v.title_id = t.id`;
  const params = [];
  if (person) {
    sql += ' JOIN viewing_people vp ON v.id = vp.viewing_id WHERE vp.person = ? AND t.genre IS NOT NULL';
    params.push(person);
  } else {
    sql += ' WHERE t.genre IS NOT NULL';
  }
  const rows = db.prepare(sql).all(...params);
  const genreCounts = {};
  for (const row of rows) {
    try {
      for (const g of JSON.parse(row.genre)) {
        genreCounts[g] = (genreCounts[g] || 0) + 1;
      }
    } catch {}
  }
  return Object.entries(genreCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, Math.min(limit, 30))
    .map(([genre, count]) => ({ genre, count }));
}

function toolGetFamilyRotation() {
  const override = db.prepare("SELECT value FROM settings WHERE key = 'family_rotation_next_override'").get();
  const lastChooser = db.prepare(`
    SELECT vp.person FROM viewings v JOIN viewing_people vp ON v.id = vp.viewing_id
    WHERE v.tags LIKE '%family_movie_night%' AND vp.role = 'chooser' AND v.date IS NOT NULL
    ORDER BY v.date DESC LIMIT 1
  `).get();
  let nextChooser;
  if (override) {
    nextChooser = override.value;
  } else if (lastChooser) {
    const idx = ROTATION.indexOf(lastChooser.person);
    nextChooser = ROTATION[(idx + 1) % ROTATION.length];
  } else {
    nextChooser = ROTATION[0];
  }
  return { next_chooser: nextChooser, rotation: ROTATION, last_chooser: lastChooser?.person || null };
}

function toolAddToList({ title_id, list_name, added_by }) {
  const list = db.prepare('SELECT * FROM lists WHERE name = ?').get(list_name);
  if (!list) return { error: `List "${list_name}" not found` };
  const title = db.prepare('SELECT title FROM titles WHERE id = ?').get(title_id);
  if (!title) return { error: 'Title not found' };
  try {
    db.prepare('INSERT INTO list_items (list_id, title_id, added_by) VALUES (?, ?, ?)').run(list.id, title_id, added_by || null);
    return { success: true, message: `Added "${title.title}" to ${list.display_name}` };
  } catch (e) {
    if (e.message.includes('UNIQUE')) return { error: `"${title.title}" is already on ${list.display_name}` };
    throw e;
  }
}

function toolRemoveFromList({ title_id, list_name }) {
  const list = db.prepare('SELECT * FROM lists WHERE name = ?').get(list_name);
  if (!list) return { error: `List "${list_name}" not found` };
  const title = db.prepare('SELECT title FROM titles WHERE id = ?').get(title_id);
  const result = db.prepare('DELETE FROM list_items WHERE list_id = ? AND title_id = ?').run(list.id, title_id);
  if (result.changes === 0) return { error: 'Item not found on this list' };
  return { success: true, message: `Removed "${title?.title}" from ${list.display_name}` };
}

// --- Tool dispatch ---

function executeToolCall(name, input) {
  try {
    switch (name) {
      case 'search_titles': return toolSearchTitles(input);
      case 'get_title_details': return toolGetTitleDetails(input);
      case 'get_viewing_history': return toolGetViewingHistory(input);
      case 'get_list_items': return toolGetListItems(input);
      case 'get_all_lists': return toolGetAllLists(input);
      case 'get_person_stats': return toolGetPersonStats(input);
      case 'get_top_directors': return toolGetTopDirectors(input);
      case 'get_top_genres': return toolGetTopGenres(input);
      case 'get_family_rotation': return toolGetFamilyRotation(input);
      case 'add_to_list': return toolAddToList(input);
      case 'remove_from_list': return toolRemoveFromList(input);
      default: return { error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    console.error(`Tool ${name} error:`, err);
    return { error: `Failed to execute ${name}` };
  }
}

// --- Chat endpoint ---

router.post('/', async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'your-key-here') {
    return res.status(503).json({ error: 'Chat is not configured. Set ANTHROPIC_API_KEY in .env and restart the server.' });
  }

  const { messages, person } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array required' });
  }

  try {
    // Keep conversation manageable — trim to last 40 messages if too long
    const trimmed = messages.length > 40 ? messages.slice(-40) : messages;
    let anthropicMessages = trimmed.map(m => ({ role: m.role, content: m.content }));

    // Agentic loop: keep calling Claude until no more tool_use
    let response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: buildSystemPrompt(person),
      tools,
      messages: anthropicMessages,
    });

    let iterations = 0;
    while (response.stop_reason === 'tool_use' && iterations < 5) {
      iterations++;
      const assistantContent = response.content;
      anthropicMessages.push({ role: 'assistant', content: assistantContent });

      const toolResults = [];
      for (const block of assistantContent) {
        if (block.type === 'tool_use') {
          const result = executeToolCall(block.name, block.input);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(result),
          });
        }
      }

      anthropicMessages.push({ role: 'user', content: toolResults });

      response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: buildSystemPrompt(person),
        tools,
        messages: anthropicMessages,
      });
    }

    const textContent = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    res.json({ response: textContent });
  } catch (err) {
    console.error('Chat error:', err);
    const apiMsg = err?.error?.error?.message;
    if (apiMsg && apiMsg.includes('credit balance')) {
      return res.status(503).json({ error: 'The Anthropic API needs credits. Top up at console.anthropic.com and try again.' });
    }
    res.status(500).json({ error: 'Something went wrong. Try again?' });
  }
});

module.exports = router;
