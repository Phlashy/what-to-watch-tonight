# Known Issues

Last updated: 2026-06-29

## Resolved

### iOS bottom-sheet close button unreachable (2026-06-29)

- **"Add to list" ✕ couldn't be tapped** — the Add-to-list / Edit-list / New-list
  bottom sheets had no `max-height`, so with many lists the sheet grew taller than
  the screen; anchored to the bottom (`items-end`), its top and the ✕ were pushed
  off the top / under the status bar. Capped at `max-h-[90vh]` with internal
  scrolling (matching the Log-a-viewing modal), keeping the header + ✕ on-screen.

### iOS form zoom & search scroll (2026-06-22)

- **Edit forms ran off-screen to the right** — iOS Safari zooms the page in when
  you focus a text field smaller than 16px; the inputs were `text-sm` (14px), so
  every edit form zoomed and spilled right. Fixed by forcing form controls to
  16px on phone widths (`@media (max-width: 640px)` in `index.css`); desktop is
  unchanged.
- **Search results appeared scrolled partway down** — the keyboard/focus could
  leave the results list scrolled past the first (best) match. The Search page now
  scrolls back to the top whenever a new search runs.

### iOS top safe-area — buttons hidden under the status bar (2026-06-22)

- **Back/close buttons sat behind the iPhone clock & battery** — the app renders
  edge-to-edge (`viewport-fit=cover` and a translucent status bar in `index.html`),
  so top content draws under the status bar. The bottom safe area was handled, but
  the top used fixed paddings (`pt-12` / `pt-14`) that didn't match the notch /
  Dynamic Island inset, leaving the top controls unreachable on a notched iPhone
  (reported on an iPhone 14). Fixed with a `pt-safe` utility
  (`calc(0.75rem + env(safe-area-inset-top))`) applied to every top bar; the inset
  resolves to `0` on non-notched / desktop, so layout there is unchanged.

### Navigation context preserved (2026-06-18)

- **Watch Log tab reset on return** — the Movies/Shows tab was component-local
  state defaulting to Movies, so returning from a show's detail page dropped you
  back on Movies. The tab now lives in the URL (`?tab=shows`), restored on
  back/refresh.
- **Title Back button could land on a default screen** — the title page relied on
  `navigate(-1)`, which is unreliable on deep links / PWA cold-starts. It now
  prefers a real browser-back when there's in-app history (so scroll is restored
  too) and falls back to the origin captured via `state.from` (a new
  `useFromState` hook threaded through every link into a title).

### Post-audit robustness pass (2026-06-09)

- **Tag filter matched substrings** — filtering viewings by tag `comedy` also
  matched `dark_comedy`. Tags are stored as a JSON array, so the filter now
  matches the quoted form (`%"comedy"%`). Regression-tested.
- **Updates/deletes on missing rows reported success** — `PUT`/`DELETE` on
  viewings, list items, shortlists, and collection entries now return 404 when
  the row doesn't exist (previously `{success: true}` or an empty body).
- **Uncapped pagination** — `limit` is clamped to 200 (and `page` to ≥ 1) on the
  titles, viewings, and show-log endpoints.
- **TMDB proxy hardening** — all TMDB calls share a 10s timeout; errors are
  forwarded to the global handler (no more raw upstream messages in production);
  a missing API key returns a friendly 503; the watch-providers region is now
  configurable (`watchProvidersRegion` in `family.config.json`, default CA).
- **Chat error handling** — uses the Anthropic SDK's typed errors (credits,
  bad key, upstream rate limit, outage each get a useful message), and a
  tool-loop that hits its iteration cap now answers instead of sending an
  empty message. Model id hoisted to one constant.
- **Misc** — rate-limiter map now sheds expired entries; `trust proxy` set so
  rate limiting sees real client IPs behind Nginx; non-hashed icons no longer
  cached for a year; the reorder endpoint moved to `/api/lists/items/reorder`
  (its old `:name` segment was ignored).

### Phase 3 · Tiers 2–3 — security, docs, UX polish & features (2026-06-01/02)

- **Accessibility** — icon-only buttons now have `aria-label`s; all modals use `role="dialog"` + `aria-modal` and close on Escape (shared `useOnEscape`); drag reordering is keyboard-operable (dnd-kit `KeyboardSensor`); the lowest-contrast secondary text was lifted off `slate-600`. (A `slate-400` vs `slate-500` review is still owed — see Open Issues.)
- **No index on `viewing_people.person`** — added via migration `003` (speeds person-filtered queries).
- **`cast` reserved word used unquoted** — fixed (quoted) as part of the `PUT /api/titles/:id` 500 fix.
- **Pixel avatars not integrated** — now rendered in NavBar and PersonPicker (avatar data in `family.config.json`).
- **No persistent chat history** — the Ask tab now persists messages to `localStorage`.
- **Shortlist stars / "can't remove" on TitleDetail** — TitleDetail has a standalone "Shortlisted" section that lists every star by its real context and removes any of them (incl. orphaned-context ones). Server toggle is intentionally per-`(title, person, context)`. Confirmed against production (no stuck rows).
- **Sorting & list management** — added (sort on Lists/ListDetail/Collection; rename/icon/delete a list). See `CHANGELOG.md`.
- **Native `confirm()`/`alert()`** — replaced with a styled in-app dialog.
- **Back navigation jumped to the top** — scroll position is now restored on back/forward.

### Phase 3 · Tier 1 — tests, migrations, CI (2026-05-30)

- **Dependency advisories cleared** — `npm audit fix` brought root + server to 0 vulnerabilities; client high/moderate (postcss) fixed. **GitHub Actions CI** added (`.github/workflows/ci.yml`): installs all three trees, runs the test suite, builds the client, and fails on high/critical audit advisories.
- **Migration runner** — schema now built by `server/lib/migrate.js` from numbered reversible migrations with a `schema_migrations` ledger; db.js, tests, and the importer share it (no drift). Verified safe on a copy of production.

#### Accepted (low-risk, tracked)

- **Client dev-toolchain advisories (Vite / esbuild / Babel)** — these now rate
  _high_ (esbuild dev-server RCE, `@babel/core` file read) and would fail
  `npm audit --audit-level=high`, but they live entirely in the client's
  **build toolchain** (`devDependencies`), which never ships to the Pi or a
  user's browser — the client deploys as prebuilt static assets. As of
  **2026-06-17** the client CI audit runs `npm audit --omit=dev --audit-level=high`,
  so it gates on the deps that actually ship (React, Router, dnd-kit) while not
  failing on dev-server advisories. Root and server stay full-strength.
  - **TODO (deferred, do deliberately): upgrade Vite 5 → 8** (+ `@vitejs/plugin-react`
    4 → 5) to clear these at source. It's a 3-major jump and this app's
    `/movie-night/` base-path correctness rides on Vite's `base` / `BASE_URL`
    handling (`client/src/api.js`, router basename, asset prefixing), so it needs
    a real build + in-browser verification pass — not `npm audit fix --force`.
    Keep Tailwind on 3 (Tailwind 4 is a separate migration). After the upgrade,
    the client audit can drop `--omit=dev` again if the advisories clear.

### Phase 3 · Tier 1 — make tests real (in progress, 2026-05-30)

- **`PUT /api/titles/:id` always returned 500 (in-app title rename was broken)** — the SET clause used a bare reserved word (`cast = COALESCE(?, cast)`), which SQLite parsed as the CAST operator → syntax error. Surfaced by converting the titles test to a real integration test. Fixed by quoting `"cast"` and null-coercing omitted binds.
- **Tests now exercise the real route handlers** — DB injected via `app.locals.db`; supertest harness (`createTestApp` in `tests/helpers.js`); what-to-watch, viewings side-effects, lists, titles, collection, shortlists, stats converted from reimplemented-SQL to HTTP integration tests (now also covering 400/404/409 paths). 102 tests, green.

### Phase 3 · Tier 0 — correctness & data integrity (2026-05-30)

- **Rotation gave two different answers** — the Tonight tab and the chat "Ask" tab computed "whose turn" from different sources (chat used `viewing_people.role='chooser'`, set for every attendee, plus a settings key nothing wrote). Both now read one shared core (`server/lib/rotation.js`).
- **Finishing/dropping a show emptied every shared list for everyone** — `show-status` now only auto-removes a show from to-watch lists once no person still has a `wishlist`/`watching` status (`server/lib/show-status.js`). The Watch Log was never affected.
- **Server errors returned HTML the client couldn't parse** — added a global JSON error handler + JSON 404 for unknown API routes (`server/index.js`).
- **Blank-screen-forever on config failure** — `FamilyContext` now shows a "Can't reach the server" retry screen; added a top-level `ErrorBoundary` and a reusable `ErrorState` (wired into the Tonight page) so failed loads surface a message + retry instead of empty/stale screens.

- **SQL injection in what-to-watch query** — String interpolation replaced with parameterized queries
- **picked_by update too broad** — Now scoped to family_to_watch list only
- **Shortlist stars missing on TitleDetail** — Added standalone shortlist section
- **Shortlist toggle not optimistic** — Now updates UI immediately, reverts on failure
- **Dismissed cards lost on refresh** — Now persisted to sessionStorage
- **bug-report.md review (2026-03-28)** — 17 bugs were reported and verified; 16 of 17 were already fixed. Remaining open items tracked below.
- **Family rotation picking wrong chooser** — `viewings.picked_by` column added; rotation query now reads this column instead of `viewing_people.role` (which was always 'chooser' for everyone).
- **Mobile "Who chose?" picker unreachable** — "Picked by" / "Who chose?" was buried after the per-person ratings grid in both LogViewing and the TitleDetail edit form. Moved to immediately after the Date field so it's visible without scrolling.
- **PWA home screen shortcuts serving stale client** — Two bugs combined: (1) `express.static` was serving `index.html` with `max-age=1y, immutable` due to missing `index: false`; (2) `client/dist/` was in `.gitignore` so the Pi never received built client updates via `git pull`. Both fixed: dist is now tracked in git, and the static middleware sends `no-cache` for HTML. A service worker was also added for belt-and-suspenders PWA update reliability.
- **TMDB search returning movies only in QuickAdd** — `QuickAdd.jsx` was calling `/api/tmdb/search` with no `type` parameter, hitting the server default of `movie`. Fixed to use `type=multi`.
- **TMDB multi-search burying TV shows** — The `/search/multi` TMDB endpoint ranks all types by popularity together, so niche TV shows were pushed off the top-10 results by popular movies with similar names. Fixed: now runs parallel `/search/movie` and `/search/tv` requests and merges results sorted by TMDB popularity score.
- **"Own it" / collection button hidden** — The button to add a DVD/Blu-ray/Digital copy was a tiny unlabelled icon only visible after loading streaming providers. Replaced with a clearly labelled "Own it" button in the action row, always visible.
- **QuickAdd list options from family config, not DB** — `QuickAdd.jsx` was reading list options from `useFamily()` (which reads `family.config.json`), so lists created in-app (e.g. "Shows to Watch") never appeared. Fixed to fetch from `/api/lists`.

## Open Issues

### Accessibility

- Cards lack a semantic heading hierarchy.
- `slate-400` vs `slate-500` for faint secondary text not yet decided — the
  contrast pass lifted everything off `slate-600` to `slate-500` (~4:1, AA-
  borderline for the smallest text); going fully AA would mean `slate-400`
  everywhere, a brighter look. To be reviewed together.

### Performance

- TitleDetail loads all viewings without pagination (fine for current data,
  could matter if a single title accumulates many viewings).
- Watch Log uses "Load more" pagination; back-navigation only restores scroll
  within the already-loaded pages (follow-up to the scroll-restoration work).
- Chat AI genre/director stats parse JSON arrays in JavaScript rather than SQL.

### Data Model

- `genre` and `cast` stored as JSON strings — normalized tables would improve
  queryability but add complexity.

### Missing Features (wishlist)

- **Delete a title in-app** — no UI path; only the `dedup-titles.js` script.
- **One-tap "we watched this" from a Tonight card** — currently requires the
  full Log modal. (Smallest-effort, highest daily-use win.)
- **Streaming / where-to-watch on list, Search & Collection views** — the data
  is cached on the title and shown on Tonight cards + TitleDetail, but nowhere
  else.
- **Per-person "for me" screens** — no "my shortlist / my ratings / my stats"
  UI surface (the chat can produce stats, but there's no screen for it).
- **Undo for destructive actions** — delete viewing, remove from list, and the
  broad finish-a-show list behaviour are all immediate.
- No search bar on all pages (only on the dedicated Search page).
- API authentication is opt-in only (`APP_PASSWORD`); off by default, fine for
  LAN use.

_Decided out of scope (do not revive):_ episode-level logging — the model was
deliberately changed to log a **watching session of a series** (no per-episode
granularity), which is implemented and working. An "it's your turn" rotation
nudge is also not wanted; rotation stays passive.

### UX

- Loading skeleton components are not shared (each page has its own inline
  skeleton).
- Guest name input in PersonPicker has no max-length enforcement.
