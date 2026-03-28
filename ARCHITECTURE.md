# Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (React SPA)                                        │
│  ┌─────────┐ ┌──────────┐ ┌──────┐ ┌──────┐ ┌────────────┐│
│  │WhatTo   │ │TitleDeta │ │Watch │ │Lists │ │  Chat (AI) ││
│  │Watch    │ │il        │ │Log   │ │      │ │            ││
│  └────┬────┘ └────┬─────┘ └──┬───┘ └──┬───┘ └─────┬──────┘│
│       │           │          │        │            │       │
│  ┌────┴───────────┴──────────┴────────┴────────────┴──────┐│
│  │  api.js  →  fetch('/movie-night/api/...')               ││
│  └──────────────────────────┬─────────────────────────────┘│
└─────────────────────────────┼──────────────────────────────┘
                              │ HTTP (JSON)
┌─────────────────────────────┼──────────────────────────────┐
│  Express Server (port 3001) │                              │
│  ┌──────────────────────────┴─────────────────────────────┐│
│  │  Routes                                                ││
│  │  ├── /api/titles         CRUD for movie/show titles    ││
│  │  ├── /api/viewings       Watch history + side effects  ││
│  │  ├── /api/lists          Watchlists + reordering       ││
│  │  ├── /api/shortlists     Per-person stars/favorites    ││
│  │  ├── /api/collection     Physical/digital media        ││
│  │  ├── /api/what-to-watch  Context-filtered suggestions  ││
│  │  ├── /api/family-rotation  Whose turn to pick          ││
│  │  ├── /api/stats          Dashboard statistics          ││
│  │  ├── /api/tmdb           TMDB metadata proxy           ││
│  │  └── /api/chat           Claude AI assistant           ││
│  └──────────────────────────┬─────────────────────────────┘│
│                             │                              │
│  ┌──────────────────────────┴─────────────────────────────┐│
│  │  better-sqlite3 (WAL mode, foreign keys)               ││
│  │  ~/movie-night-data/movies.db                          ││
│  └────────────────────────────────────────────────────────┘│
│                                                            │
│  External: TMDB API (metadata) · Anthropic API (chat AI)   │
└────────────────────────────────────────────────────────────┘
```

## Module Responsibilities

### Server

| File | Responsibility |
|------|---------------|
| `server/index.js` | Express setup, CORS, config loading, static serving, health endpoint. Mounts all route modules. |
| `server/db.js` | Database initialization: opens SQLite, enables WAL + foreign keys, runs migrations, exports the `db` instance. |
| `server/migrations/001_initial.sql` | Full schema: titles, viewings, viewing_people, lists, list_items, people, settings, shortlists. |
| `server/routes/titles.js` | CRUD for titles. Search by title/director/cast/synopsis. Pagination. |
| `server/routes/viewings.js` | CRUD for viewings. Complex filtering (person, date, rating, tags). Side effects: auto-remove from family list on family_movie_night, clear rotation override. |
| `server/routes/lists.js` | List management. Add/remove/reorder items. Transactional bulk reorder. |
| `server/routes/what-to-watch.js` | Context-filtered title suggestions. Joins lists, viewings, shortlists, collection. Family context excludes recently watched. |
| `server/routes/rotation.js` | Family movie night rotation. Determines next chooser, supports skip/clear override. |
| `server/routes/stats.js` | Dashboard stats: total watched, total titles, total to-watch, recent viewings. |
| `server/routes/shortlists.js` | Per-person per-context star/favorite toggle. Grouped queries by title. |
| `server/routes/collection.js` | Physical/digital media tracking (DVD, Blu-ray, Digital). Format validation. |
| `server/routes/tmdb.js` | TMDB API proxy for search, enrichment, and watch provider lookups. Caches providers in DB. |
| `server/routes/chat.js` | Claude Haiku AI assistant with 11 tools for querying family data. Agentic loop (max 5 iterations). |

### Client

| File | Responsibility |
|------|---------------|
| `client/src/App.jsx` | React Router setup with base path `/movie-night`. Renders all pages + NavBar + PersonPicker. |
| `client/src/api.js` | Fetch wrapper with base URL handling and error checking. Throws on non-OK responses. |
| `client/src/utils.js` | Shared utilities: `parseJSON()` for safe JSON parsing with fallback. |
| `client/src/context/FamilyContext.jsx` | Loads family config from API. Provides members, contexts, lists, avatars, colors, streaming IDs. |
| `client/src/context/PersonContext.jsx` | Current person selection. Persisted to localStorage. Controls PersonPicker visibility. |
| `client/src/pages/WhatToWatch.jsx` | Main page. Context tabs, drag-and-drop reordering, swipe-to-dismiss, shortlist stars, random pick, rotation display. |
| `client/src/pages/TitleDetail.jsx` | Full title view: metadata, viewing history with inline editing, list memberships, shortlists, watch providers, collection. |
| `client/src/pages/WatchLog.jsx` | Viewing history with filters (search, person, rating, tags, notes) and infinite scroll. |
| `client/src/pages/Search.jsx` | Full-text title search with debounced input. |
| `client/src/pages/Lists.jsx` | Dashboard of all watchlists with item counts. Quick-add entry point. |
| `client/src/pages/ListDetail.jsx` | Individual list view with items and remove capability. |
| `client/src/pages/Collection.jsx` | Physical media inventory with format filter (DVD/Blu-ray/Digital). |
| `client/src/pages/Chat.jsx` | AI chat interface with title link parsing and suggestion chips. |
| `client/src/components/NavBar.jsx` | Fixed bottom navigation with 5 tabs + person avatar button. |
| `client/src/components/PersonPicker.jsx` | Full-screen modal for selecting the current family member or guest. |
| `client/src/components/TitleCard.jsx` | Reusable card: poster, title, year, runtime, director, genres, rating, streaming badge. |
| `client/src/components/LogViewing.jsx` | Modal for logging a viewing: title search, date, people, per-person ratings, tags, notes. |
| `client/src/components/QuickAdd.jsx` | Modal for adding a title: TMDB search → enrich → select lists → add. |
| `client/src/components/TMDBPicker.jsx` | Modal for fixing/changing a title's TMDB match. |
| `client/src/components/PixelAvatar.jsx` | SVG pixel art avatar renderer from config grid data. |

## Data Flow

### User action → screen update

```
1. User taps "Log Viewing" on TitleDetail
2. LogViewing modal opens, user fills form, taps Save
3. Client calls POST /api/viewings with { title_id, date, people, tags, ... }
4. Server inserts into viewings + viewing_people tables
5. If tags include 'family_movie_night':
   a. Deletes title from family_to_watch list_items
   b. Clears any rotation skip override
6. Server returns the new viewing record
7. Client refreshes TitleDetail data → shows updated viewing history
```

### Family rotation determination

```
1. Query: Find most recent viewing tagged 'family_movie_night' with a 'chooser' role
2. If a skip override exists in settings → use that person
3. Otherwise → advance to next person in rotation array (wraps around)
4. Override is cleared when any family_movie_night viewing is logged
```

## Key Design Decisions

- **SQLite over Postgres**: Single-file database suits a family app on a Raspberry Pi. WAL mode provides adequate concurrency for a handful of users.
- **JSON in columns**: `genre`, `cast`, and `tags` are stored as JSON strings rather than normalized tables. This trades query flexibility for simplicity — these fields are mostly displayed, rarely queried individually.
- **Context-scoped shortlists**: Stars/favorites are scoped to a viewing context (family, solo, date night, etc.) so the same title can be shortlisted differently per context.
- **Parameterized SQL throughout**: All user-supplied values go through prepared statement parameters, never string interpolation.
- **No authentication**: This is a family app on a local network — the "current person" is selected via UI, not enforced. Security is at the network level (local WiFi only).
