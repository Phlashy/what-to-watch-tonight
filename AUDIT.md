# Movie Night App — Codebase Audit

**Date:** 2026-03-28
**Scope:** Full codebase review (server + client + scripts + config)

---

## 1. Architecture Overview

```
┌──────────────────────────────────────────────────────┐
│  Client (React + Vite + Tailwind)  — port 3000 (dev) │
│  Base path: /movie-night/                             │
│  8 pages, 7 components, 2 contexts                    │
├──────────────────────────────────────────────────────┤
│       ↓ fetch() via api.js (proxied in dev)           │
├──────────────────────────────────────────────────────┤
│  Server (Express)  — port 3001                        │
│  7 route modules + inline endpoints in index.js       │
├──────────────────────────────────────────────────────┤
│  Database (better-sqlite3, WAL mode)                  │
│  ~/movie-night-data/movies.db                         │
│  9 tables, 7 indexes                                  │
├──────────────────────────────────────────────────────┤
│  External APIs: TMDB (metadata), Anthropic (chat AI)  │
└──────────────────────────────────────────────────────┘
```

**Production:** PM2 → Express serves built client + API on port 3001 → Nginx reverse proxy at `/movie-night/` on Raspberry Pi (`anguspi.local`).

---

## 2. Dependency Map

### Server

```
server/index.js
├── server/db.js → better-sqlite3 → ~/movie-night-data/movies.db
│   └── server/migrations/001_initial.sql
├── family.config.json (loaded at startup, shared via app.locals)
├── server/routes/titles.js    → db.js
├── server/routes/viewings.js  → db.js
├── server/routes/lists.js     → db.js
├── server/routes/tmdb.js      → db.js, fetch (TMDB API)
├── server/routes/shortlists.js → db.js
├── server/routes/collection.js → db.js
└── server/routes/chat.js      → db.js, @anthropic-ai/sdk, family.config (via app.locals)
```

**Tight coupling:** `index.js` has inline route handlers for `/api/what-to-watch/:context`, `/api/family-rotation`, and `/api/stats` that should arguably be in their own route files.

### Client

```
App.jsx
├── context/FamilyContext.jsx → GET /api/config (loads once at mount)
├── context/PersonContext.jsx → localStorage('movie-night-person')
├── components/NavBar.jsx     → PersonContext
├── components/PersonPicker.jsx → FamilyContext, PersonContext
└── pages/
    ├── WhatToWatch.jsx → api, LogViewing, QuickAdd, FamilyContext, PersonContext, @dnd-kit
    ├── WatchLog.jsx    → api, FamilyContext, PersonContext
    ├── Search.jsx      → api
    ├── Lists.jsx       → api, QuickAdd, FamilyContext
    ├── ListDetail.jsx  → api, QuickAdd, FamilyContext
    ├── TitleDetail.jsx → api, LogViewing, TMDBPicker, FamilyContext, PersonContext
    ├── Collection.jsx  → api
    └── Chat.jsx        → api, PersonContext
```

**Shared components:** TitleCard (used by WatchLog, Search, ListDetail, Collection), LogViewing (used by WhatToWatch, TitleDetail), QuickAdd (used by WhatToWatch, Lists, ListDetail).

---

## 3. Feature Inventory

### Core Features

| Feature | Status | Notes |
|---------|--------|-------|
| Title database (602 titles, enriched with TMDB) | ✅ | Working |
| What-to-Watch page with context switching | ✅ | Family, solo, date night, etc. |
| Family rotation (whose turn to pick) | ✅ | With skip/clear support |
| Viewing log (create, edit, delete) | ✅ | Per-person ratings, tags, notes |
| Watch history with filters & sorting | ✅ | Search, person, rating, tags, has-notes filters |
| Custom lists (9 lists) | ✅ | View, add, remove, reorder |
| TMDB search & enrichment | ✅ | Manual + scripted enrichment |
| AI chat assistant | ✅ | Claude Haiku with 11 tools |
| Physical collection tracking | ✅ | DVD, Blu-ray, Digital |
| Drag-and-drop list reordering | ✅ | @dnd-kit on WhatToWatch |
| Swipe-to-dismiss cards | ✅ | WhatToWatch page |
| PWA install support | ✅ | Manifest, icons, standalone mode |
| Watch providers (streaming availability) | ✅ | TMDB Watch Providers API, cached |
| Person picker with localStorage persistence | ✅ | Modal on first visit |
| Quick-add title flow (search → TMDB → lists) | ✅ | QuickAdd modal |
| Per-person star/shortlist on WhatToWatch | ⚠️ | See Bug #1, #2 below |
| Star/shortlist on TitleDetail page | ⚠️ | Exists but context mapping may fail — see Bug #2 |
| Random pick ("I'm Feeling Lucky") | ✅ | Working |
| Picked-by person tracking | ✅ | On log creation + list item display |
| Pixel avatars | 🔇 | Component created but not integrated into PersonPicker or NavBar |
| Search bar on all pages | 🔇 | Only on Search page |
| Persistent chat history | 🔇 | Chat resets on page navigation |
| Offline support (service worker) | 🔇 | PWA manifest only, no caching |

### Bugs

#### Bug #1: Can't remove star from Davin's "Asterix" item
- **Symptom:** Shortlist star on a specific item can't be toggled off
- **Root cause investigation:** The shortlist toggle on WhatToWatch (line 396) calls `POST /api/shortlists` with `{ title_id, person, context }`. The server toggles based on exact match of all 3 fields. If the `context` sent from the client doesn't match the `context` stored in the database, the existing record won't be found and a duplicate will be inserted (which the UNIQUE constraint would reject). The WhatToWatch page sends the current page context (e.g., "family"), but the shortlist may have been created under a different context.
- **Likely fix:** Ensure the context used for toggle matches the context under which the shortlist was created. Alternatively, the toggle endpoint should identify by `(title_id, person)` within the current context's scope.

#### Bug #2: Star should show on TitleDetail page (shortlist UI incomplete)
- **Symptom:** TitleDetail page has shortlist UI (lines 629-653) but it's nested inside the "On Lists" section. If a title isn't on any list, no shortlist UI appears at all.
- **Root cause:** Shortlist UI is rendered per-list-membership via `LIST_TO_CONTEXT` mapping. If the title has no list memberships, or the list doesn't map to a context, stars don't appear.
- **Likely fix:** Add a standalone shortlist toggle outside the list membership section.

#### Bug #3: `picked_by` update is too broad (server/routes/viewings.js:104)
- **Symptom:** When logging a viewing with `picked_by`, ALL list_items for that title (across ALL lists) get their `added_by` updated.
- **Root cause:** `UPDATE list_items SET added_by = ? WHERE title_id = ?` doesn't filter by list.
- **Impact:** Low severity currently (titles are usually on 1-2 lists), but incorrect data.

#### Bug #4: SQL injection in what-to-watch query (server/index.js:63)
- **Symptom:** The `context` parameter is interpolated directly into SQL via template literal: `` s.context = '${context}' ``
- **Root cause:** String interpolation instead of parameterized query.
- **Impact:** The `context` value is validated against `contextListMap` on line 48 (returns 400 if unknown), which mitigates exploitation. But the `cutoffDate` on line 76 is also interpolated and is derived from `new Date()`, so it's safe. Still, this pattern should be fixed for correctness.
- **Note:** The shortlists route (shortlists.js:14) correctly uses parameterized queries for the same data.

#### Bug #5: Shortlist state update is not truly optimistic (WhatToWatch.jsx:396-410)
- **Symptom:** The `await` on line 397 means the UI waits for the server response before updating the star state. On slow connections, there's a noticeable delay.
- **Root cause:** State update (line 403) happens after `await` completes.
- **Impact:** UX only — no data issues.

#### Bug #6: Dismissed cards reset on page refresh (WhatToWatch.jsx:412-414)
- **Symptom:** Swiped-away cards reappear after page refresh.
- **Root cause:** `dismissed` is a `useState(new Set())` — not persisted.
- **Impact:** Minor annoyance, user has to re-dismiss.

---

## 4. Root Cause Grouping

### Group A: Shortlist context mismatch (Bugs #1, #2)
Both bugs stem from the shortlist system's dependency on `context`. The WhatToWatch page knows its context, but the TitleDetail page has to infer context from list memberships. A title could be shortlisted under one context but viewed via a different context, causing toggle failures and missing UI.

### Group B: Inline SQL interpolation (Bug #4)
The `what-to-watch` endpoint in index.js uses template literals for SQL values while every other endpoint uses parameterized queries. Inconsistent pattern.

### Group C: Non-list-scoped operations (Bug #3)
The `picked_by` update affects all list_items for a title instead of just the relevant list. This is a data integrity issue.

---

## 5. Code Quality Observations

### Positives
- Clean separation: server routes each in own file, React pages/components well-structured
- Family config externalized and loaded dynamically
- Database migrations are idempotent (IF NOT EXISTS, try/catch for ADD COLUMN)
- WAL mode enabled for SQLite concurrency
- Good use of React context for global state
- Mobile-first design with safe-area support

### Issues to Address

**Repeated patterns:**
- JSON parsing of `genre`, `cast`, `tags`, `people` is duplicated across 8+ components/routes. Should be a shared utility.
- Rating aggregation logic (COALESCE of per-person vs. per-viewing rating) appears in 5+ SQL queries.

**Error handling:**
- `api.js` is a thin fetch wrapper with no error handling. Non-200 responses silently fail when `.json()` is called.
- FamilyContext catches config load failure but renders nothing forever — no fallback or retry.

**Missing validation:**
- No input length limits on server-side text fields (notes, titles, etc.)
- No enum validation for `format` values beyond the collection route.

**Accessibility:**
- No ARIA labels on icon buttons (NavBar, modal close buttons, star toggles).
- Modals lack `role="dialog"` and `aria-modal`.

**Performance:**
- TitleDetail loads all viewings for a title without pagination.
- Chat.js genre/director stats parse JSON in JavaScript instead of SQL.
- No database indexes on frequently-joined columns like `viewing_people.person`.

**File organization:**
- `index.js` contains 3 complex endpoints (what-to-watch, rotation, stats) that could be extracted to route files.
- `TitleDetail.jsx` is 953 lines — largest file in the project, does too many things.

---

## 6. Database Schema Notes

**Well-designed:**
- UNIQUE constraints prevent duplicate list items, shortlists, collection entries
- Foreign key constraints enabled
- Indexes on primary lookup paths

**Could improve:**
- No index on `viewing_people.person` (used in person-filtered queries)
- No index on `titles.title` (used in LIKE searches)
- `tags` stored as JSON string, queried with LIKE — fragile for multi-tag filtering
- `cast` and `genre` stored as JSON strings — frequently parsed in app code

---

## 7. Summary

The codebase is well-structured for a personal/family app. The primary bugs are all in the shortlist system (context mismatch) and one SQL interpolation pattern. Code quality is generally good but would benefit from:

1. Fixing the shortlist bugs (Group A) — highest priority functional issue
2. Fixing the SQL interpolation (Group B) — correctness
3. Fixing the picked_by scope (Group C) — data integrity
4. Extracting repeated JSON parsing into a shared utility
5. Adding error handling to the API client
6. Breaking up TitleDetail.jsx

No crashes or data-loss bugs were found. The app runs and serves its primary purpose well.
