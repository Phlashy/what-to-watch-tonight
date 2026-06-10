# Audit — Tech Debt (Phase 2)

**Date:** 2026-05-30
Severity: 🔴 correctness/security/data · 🟡 maintainability/quality · 🟢 minor.

The headline: this is **above-average code for an iteratively-AI-built hobby app** — consistent style, parameterized SQL, real tests, externalized config. The debt is concentrated in a handful of cross-cutting gaps and a few features that now have two implementations.

---

## 1. Code quality

🟡 **Two oversized files.** `TitleDetail.jsx` (1094 lines) and `WhatToWatch.jsx` (726) each hold 3–4 inline sub-components plus heavy logic. They're readable but hard to navigate, test, or change safely. Extracting `ViewingItem`, `AddToListSheet`, `ShortlistButton`, `SwipeToRemove`, `WatchCard` into their own files would help.

🟡 **Duplicated logic, repeated in many places:**

- **JSON parsing** of `genre`/`cast`/`tags`/`people` — handled by `parseJSON` on the client (good) but **re-implemented ad hoc on the server** (chat.js parses genre JSON in JS in two tools; tmdb.js, titles.js stringify by hand). No shared server-side helper.
- **Rating aggregation** — the "COALESCE per-person rating, else group rating" pattern appears as a hairy correlated subquery in `viewings.js` (×4 spots), `lists.js`, and `chat.js`. One canonical SQL fragment or a view would remove a whole class of drift risk.
- **`family_to_watch` list lookup** repeated inline in `viewings.js`.
- **Provider dedup/sort** logic duplicated between `WhatToWatch.jsx` and `TitleDetail.jsx`.

🟡 **Dead / unused code:**

- `WhatToWatch.jsx:490` computes `sortedItems` that is never used.
- `ShortlistButton` receives a `context` prop it never reads; `WatchCard` receives `context` and passes it down but it's only used for the API call at the page level.
- `getRotationState` returns `skipped:false` always (a vestige; the "skip override" label in the badge can therefore never show).
- `client/src/index.html` references `/vite.svg` which isn't in `public/`.

🟡 **Naming / terminology drift** for one concept across the stack: `picked_by` (viewings), `added_by` (list_items), `chosen_by` (seed JSON), "picker"/"chooser"/"pick" (UI). Same idea, five names.

🟢 **CONTRIBUTING.md overstates reality.** It mandates "JSDoc on all functions", "constants in a dedicated file", "console.log removed (use a debug flag)". In practice JSDoc is sporadic, there's no constants file (magic arrays like the tag list and rating range `[1..10]` are inline-duplicated in LogViewing and TitleDetail), and there's no debug flag. The doc should describe what the project actually does.

---

## 2. Architecture & separation of concerns

🟡 **`require('../db')` inside handlers.** `tmdb.js` does `const db = require('../db')` _inside_ two route functions rather than at module top. Works (require caches), but inconsistent and surprising.

🟡 **Business logic lives in route handlers.** There's no service/model layer — SQL, validation, side effects, and HTTP all live together in each route. Fine at this size, but it's exactly why the tests had to re-implement queries instead of calling the code (see §5). A thin data-access layer (functions returning plain data, routes doing HTTP) would make the real code testable.

🔴 **Rotation has two divergent implementations.** This is the most important architectural defect. _(Corrected post-review: the Tonight path works correctly in production — verified against the live Pi DB, where logging_ Arrival _advanced rotation Gordon→Davin. The defect is the chat path and the disagreement between them, not "empty data".)_

- `routes/rotation.js` + `routes/viewings.js` (**works**): rotation state is a counter in `settings.family_rotation_next`, advanced on every `family_movie_night` viewing ("tough luck" rule), independent of who chose. This is what the **Tonight** tab shows, and it's correct.
- `routes/chat.js → toolGetFamilyRotation` (**unreliable**): computes next chooser from the **last `viewing_people` row with `role='chooser'`** and an override key **`family_rotation_next_override`** that _no code ever writes_. But the Log form inserts **every attendee** as `role='chooser'` (live DB: 656 'chooser' vs 134 'viewer' rows; _Arrival_ has all four family members as 'chooser'), so "last chooser" is effectively arbitrary. This is what the **Ask** tab answers with.
  These can produce different answers to "whose turn is it?". Note: `viewings.picked_by` (the good signal) **is** populated on the 21 app-logged viewings, just not on the ~500 older seed-imported ones. **Fix:** point the chat tool at the same `settings.family_rotation_next` source the Tonight tab uses; delete the dead `role='chooser'`/override logic.

🟡 **Inline route modules.** `what-to-watch`, `rotation`, `stats` are now proper route files (good — the old AUDIT.md complaint is resolved), but `index.js` still owns config loading, static serving, cache headers, and IP printing in one file.

🟡 **JSON-in-TEXT columns** (`genre`, `cast`, `tags`) force parsing everywhere and make queries like tag filtering rely on substring `LIKE` (false-positive prone: "comedy" matches "dark_comedy"). Acceptable for display fields; the `tags` filter is the one that actually misbehaves.

---

## 3. Security

Context: today it's a LAN/Tailscale app with no auth by design — reasonable. But the brief targets a public, self-hostable (and eventually cloud/mobile) product, so these matter on that horizon.

🟡 **No authentication or authorization at all.** Anyone who can reach the port has full read/write, including the write-capable chat tools (`add_to_list`, `remove_from_list`) and destructive endpoints. Fine on LAN; a blocker for any internet exposure. Even self-hosters who put it on Tailscale share it with everyone on their tailnet.

🟡 **CORS is wide open** (`app.use(cors())` with no origin allowlist). Harmless on same-origin LAN; should be configurable before public release.

🟡 **No rate limiting on `/api/chat`.** It calls the paid Anthropic API with no throttle and no per-IP cap. On an open network this is a cost/abuse vector.

🟡 **No request body size limit** (`express.json()` default is 100kb, but it's not explicit) and **no input length validation** on any text field (notes, titles, guest names, list names/descriptions). A client can write arbitrarily large strings to the DB.

🟢 **SQL injection: clean.** Every query uses prepared-statement parameters. The old string-interpolation bug in what-to-watch is fixed. ✅ (Verified across all route files.)

🟢 **XSS: low risk.** React escapes by default; no `dangerouslySetInnerHTML`. The chat `[[id:Title]]` parser builds React elements, not HTML. Watch-provider/`link` URLs from TMDB are rendered as `href` — low risk but unvalidated.

🟡 **Error messages leak internals.** `tmdb.js` returns `e.message` directly to the client on failure; uncaught errors elsewhere surface Express's default stack-bearing 500 in non-production. A global handler should return sanitized JSON.

🟡 **API keys:** loaded from `.env` (good, git-ignored). TMDB key travels in the query string (standard for TMDB v3, but it lands in any access logs). The chat endpoint correctly guards against the unset/placeholder key.

🟡 **Service worker scope leak (deployment security/correctness):** `index.html` registers the SW at the **domain root** `navigator.serviceWorker.register('/sw.js')` even though the app lives at `/movie-night/` on a **multi-app** host (anguspi serves several apps). Root-scoped registration can intercept navigations for _other_ apps on the same origin, and the `caches.match('/index.html')` offline fallback targets a path that's never cached (so offline never works). Should register `/movie-night/sw.js` with matching scope. (Manifest/icon paths _are_ correctly rewritten in the built `dist/index.html`; only the SW registration is wrong.)

---

## 4. Performance

🟢 Generally fine for the data size (hundreds of rows). better-sqlite3 is synchronous and fast; WAL is on.

🟡 **Missing index** on `viewing_people(person)` — every person-filtered viewing/stat query does a correlated `EXISTS`/`JOIN` on it. Cheap to add; documented but not done.

🟡 **Correlated subqueries** in list/viewing queries (per-row `MAX(date)`, `COUNT`, `AVG`, `json_group_array`) — acceptable now, will degrade as titles accumulate watches. The rating-aggregation subquery is run per row.

🟡 **TitleDetail loads all viewings** for a title unpaginated (fine now; a long-running show could grow).

🟡 **Frontend:** no `React.memo`/`useMemo` on the heavy list renders; `WhatToWatch` re-sorts and re-derives several arrays (`sortByShortlist` called 3–4×) on every render. Bundle is a single chunk (no route-level code splitting / lazy loading) — small today, but everything loads up front.

🟡 **N image requests** with `loading="lazy"` (good) but no responsive `srcset`; posters are fetched at `w500`/`w92` fixed sizes.

🟢 Watch providers are cached on the title row (smart — avoids repeat TMDB calls).

---

## 5. Testing

🟢 **89 tests, all green**, covering every table/feature area, including a test that _documents_ the shortlist context-mismatch bug. Isolated in-memory DB per suite. Good discipline for a hobby project.

🔴 **The tests don't test the application.** They create an in-memory SQLite DB and **re-implement the SQL inline in the test file** (e.g. `what-to-watch.test.js` redeclares the whole query; side-effect tests re-create the delete/advance logic). They never `require()` a route module or make an HTTP request. Consequences:

- Route-level **validation, error handling, status codes, and request/response shape are untested**.
- A query can be fixed in the test's copy but stay broken in `routes/` (or vice-versa) and tests stay green.
- The rotation divergence in §2 is invisible to the suite because the chat rotation tool is never exercised.

🟡 **No frontend tests at all** — no component, hook, or integration tests; no Playwright/Cypress e2e. The most gesture-heavy, bug-prone code (cards, modals) has zero automated coverage.

🟡 **No coverage reporting, no CI.** Tests run only when someone types `npm test`.

---

## 6. Dependencies & `npm audit`

All three trees have advisories (all fixable):

| Tree   | Result                     | Notable                                                                          |
| ------ | -------------------------- | -------------------------------------------------------------------------------- |
| root   | 1 **high**                 | `lodash` (transitive, via `concurrently`) — code injection / prototype pollution |
| server | 6 (4 moderate, 2 **high**) | `qs`/`body-parser`/`express` DoS chain — `express` itself flagged (4.21–4.22)    |
| client | 4 (3 moderate, 1 high)     | `postcss` XSS in stringify; esbuild/vite chain                                   |

🟡 `npm audit fix` resolves most without breaking changes; the express/qs chain wants an Express patch bump. None are exploitable on a trusted LAN, but they're exactly the kind of thing public scrutiny flags. Run audits in CI.

🟡 **Duplicate `better-sqlite3`** in root and server trees (different install, same major). Minor bloat; a workspace would dedupe.

🟢 Dependency _set_ is lean and well-chosen (no kitchen-sink UI library; dnd-kit and react-router are appropriate).

---

## 7. Build & dev tooling (DX)

🟢 `npm run dev` (concurrently runs server+client, auto-stops pm2), `npm run build`, `npm run deploy` — smooth, documented, infrequent-user-friendly. The Vite proxy for `/movie-night/api` is set up correctly.

🟡 **No linter or formatter.** No ESLint, no Prettier, no editorconfig — so style consistency is by hand (and mostly holds, credit to that). A public repo inviting contributors needs at least ESLint + Prettier.

🟡 **No TypeScript / JSDoc types.** All JS. For a codebase that wants external contributors and a future port, the lack of types means the JSON-blob columns and the `people`/`person` string contracts are entirely undocumented to tooling.

🟡 **`client/dist` is committed** (intentional, so the Pi pulls without building — documented). It's a pragmatic choice but means every client change produces a noisy build-artifact diff and the repo carries built assets. A CI build step on the Pi (or a release artifact) would be cleaner long-term.

🟡 **No `.nvmrc`/engines** pinning Node; better-sqlite3 is a native module sensitive to Node version (the local run is Node 24).

---

## 8. Error handling (consistency)

🔴 **No global Express error handler and no JSON 404 handler.** Most DB routes have no `try/catch`; an unexpected throw bubbles to Express's default handler → HTML response → client `api.js` can't extract `{error}`. Add a final `(err,req,res,next)` middleware returning sanitized JSON, and a catch-all 404.

🔴 **Client swallows load errors.** The dominant pattern is `try { await load() } finally { setLoading(false) }` with **no catch** → failures render as empty/stale screens. `FamilyContext` renders `null` forever if `/api/config` fails. There's a good `api.js` that _throws_ useful errors, but almost nothing catches them to show the user. Needs an error boundary + per-fetch error state (or a small data-fetching hook).

🟡 Where errors _are_ handled (chat credit-balance message, TMDB 500s) it's done well — the pattern just isn't applied consistently.

---

## 9. Migrations & data safety

🟡 **Schema is split between `001_initial.sql` and imperative `ALTER`/`CREATE` in `db.js`.** Five `ALTER TABLE ... ADD COLUMN` wrapped in `try{}catch{}` and two `CREATE TABLE` for collection/show*status live in code, not in numbered migration files. There's no migration \_versioning*, no down-migrations, and the `.sql` file is misleading on its own. For "documented and reversible migrations" (brief requirement) this needs a real, ordered, reversible migration system (even a tiny home-grown one).

🟡 **No automated backup step.** The brief stresses the data is precious (485 viewings spanning years). Deploy/import scripts don't snapshot the DB first. `INSERT OR IGNORE` makes import idempotent (good), but any destructive change relies on manual `scp` copies.

🟢 The data lives outside the repo and is git-ignored — correct.

---

## 10. Summary table

| Area                                                | Verdict                                                                                                                                                  |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SQL injection                                       | ✅ Clean (parameterized everywhere)                                                                                                                      |
| XSS                                                 | ✅ Low (React + safe parser)                                                                                                                             |
| Code style consistency                              | 🟢 Good for the genre                                                                                                                                    |
| Rotation feature integrity                          | 🔴 Tonight path works; chat path unreliable (`role='chooser'` is set for everyone) → two screens can disagree                                            |
| Error handling                                      | 🔴 No global handler; client swallows errors                                                                                                             |
| Tests                                               | 🔴 Don't exercise real handlers; no FE/e2e                                                                                                               |
| Auth / rate-limit / input limits                    | 🟡 None (fine for LAN, blockers for public)                                                                                                              |
| Migrations & backups                                | 🟡 Imperative, unversioned, no backup step                                                                                                               |
| Dependencies                                        | 🟡 Audit advisories in all 3 trees (fixable)                                                                                                             |
| Performance                                         | 🟡 Fine now; missing one index, some N+1 subqueries                                                                                                      |
| Tooling (lint/types/CI)                             | 🟡 Absent                                                                                                                                                |
| show-status finished/dropped removes from all lists | 🟡 Surprising global side effect — clears the show from _every_ list for _everyone_. (Only `list_items`; the Watch Log / `viewings` is **not** touched.) |
| SW scope on shared host                             | 🟡 Registers at domain root                                                                                                                              |

No data-loss or crash bugs were found in normal operation. The codebase is **fundamentally sound and worth keeping** — see `AUDIT-RECOMMENDATION.md`.
