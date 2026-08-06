# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/); the project is not yet formally
versioned.

## [Unreleased]

A full code audit (`docs/AUDIT-*.md`) and the hardening + polish work that
followed it — see `docs/AUDIT-OUTCOME.md` for the story and the result. Tiers
0–3 are complete and deployed.

### Added

- **Sorting across the app**: lists (Default / Name / Most titles / Recently
  updated), a list's titles (Manual / Title / Year / Rating / Recently added),
  and the Collection (Recently added / Title / Year). Each surface remembers its
  choice; defaults preserve prior behaviour.
- **Drag-to-reorder on a list's detail view** (in Manual sort mode), persisting
  the new order — keyboard-accessible.
- **Full list management**: rename, edit description, pick a custom emoji icon,
  or delete a list (`lists.icon` column; `PUT`/`DELETE /api/lists/:name`).
- **Add titles from TMDB directly in the Search tab** (deduped against the local
  library).
- **Persistent chat history** for the Ask tab (kept in `localStorage`).
- **Scroll position is restored on back/forward navigation** — tapping into a
  title and pressing Back returns you to where you were.
- **Navigation context is preserved (journey persistence)** — the Watch Log
  remembers its Movies/Shows tab in the URL (`?tab=shows`), so returning from a
  show keeps you on the Shows tab; and a title's Back button returns you to the
  exact screen you opened it from (real browser-back when possible — so scroll is
  restored too — falling back to the captured origin on a deep link or PWA
  cold-start, where `navigate(-1)` is unreliable).
- Optional shared-password authentication (`APP_PASSWORD`), off by default; the
  client shows a password gate when enabled.
- Configurable CORS allowlist (`CORS_ORIGIN`).
- **Multi-instance support**: the same codebase can run several fully
  independent instances (separate `.env`, `family.config.json`, database, and
  pm2 process). `WTWT_PM2_NAME` names the pm2 process (read by
  `scripts/deploy.sh`); `WTWT_DATA_DIR` points the backup script at an
  instance's data dir; `/api/config` reports `chatEnabled` so an instance with
  no Anthropic key cleanly hides the Ask tab. New idempotent
  `scripts/seed-lists.js` seeds an instance's lists/titles from JSON, and
  `scripts/weekly-usage-report.cjs` sends an aggregate (counts-only) usage pulse
  via ntfy. See [DEPLOYMENT.md](docs/DEPLOYMENT.md#running-more-than-one-instance).
- Rate limiting on the chat endpoint (protects the Anthropic API).
- Input validation: request size cap, a blanket oversized-string guard, and
  friendly per-field length limits.
- A real migration runner with a `schema_migrations` ledger and numbered,
  reversible migrations.
- React error boundary, a "can't reach the server" retry screen, and reusable
  inline error states.
- GitHub Actions CI (install · lint · format · test · build · audit), Prettier,
  and an ESLint flat config.
- Database sync + backup tooling (`npm run db:pull|check|push`, nightly Pi
  backup) — see `docs/DATA-AND-BACKUPS.md`.
- A real integration test suite (supertest against the actual route handlers).
- An index on `viewing_people(person)` (speeds up person-filtered queries).

### Changed

- **Tonight cards** replaced swipe-to-dismiss with an explicit Hide button (tap,
  reorder, star, and hide are now discrete controls); hidden cards persist
  across context tabs.
- **Accessibility**: icon-only buttons have `aria-label`s; modals use
  `role="dialog"` + `aria-modal` and close on Escape; drag reordering is
  keyboard-operable; faint secondary text was lifted off the lowest-contrast grey.
- Native `confirm()`/`alert()` replaced with a styled in-app confirm dialog.
- Rotation now has a single source of truth shared by the Tonight tab and the
  chat assistant (they could previously disagree).
- Service worker is scoped to `/movie-night/` (was the domain root) and
  precaches the app shell for offline use.
- Database is injected via `app.locals.db`, so tests exercise real handlers.
  The chat route was the last holdout (it imported the production DB directly,
  which made its tool layer untestable) — its 11 assistant tools now take the
  injected handle and are covered by `tests/chat-tools.test.js`.
- Large pages split into focused components (`TitleDetail`, `WhatToWatch`).
- Documentation consolidated into a canonical set under `docs/`. The Pi deploy
  runbook moved there too (`DEPLOY_MOVIE_NIGHT.md` → `docs/PI-RUNBOOK.md`), and
  local-only process files (private-doc symlinks, prompt scaffolding, plan
  notes) were untracked so the public repo contains only the project itself.

- **Acting on an independent code review (2026-06):** (1) list-item update/delete
  routes are now scoped to the list named in the URL — an item id from another
  list can no longer be modified or deleted through the wrong list's path (404
  instead); (2) the chat assistant's list mutations (`add_to_list` /
  `remove_from_list`) are now a server-enforced two-step — the tool refuses to
  apply a change unless called with `confirmed: true`, which the assistant only
  sets after the user explicitly agrees (defense-in-depth, since there is no
  undo); (3) cleared a high-severity dev-only `form-data` advisory via
  `npm audit fix` (test tooling only; production deps were already clean).
- **Viewings endpoint builds its filters once** — the results query and its
  pagination-count query previously duplicated ~40 lines of WHERE-clause
  construction; a filter added to one but not the other would have silently
  broken totals. Now they share one clause.
- **Chat requests use prompt caching** — the system prompt, tool definitions,
  and conversation history are cached between the assistant's tool-loop calls
  and across follow-up questions (re-read at ~10% of input price once past the
  model's 4K-token caching minimum). Volatile prompt parts (person, date) moved
  to the end of the system prompt to keep the cached prefix stable, and each
  API call now logs its token usage (visible in pm2 logs).
- **CI now guards the committed client bundle**: the Pi deploys by `git pull`
  and never builds, so CI rebuilds the client and fails if `client/dist` is
  stale relative to the source. `WORKFLOW.md`'s deploy section was rewritten to
  match this reality (it previously said the Pi rebuilds, contradicting
  `DEPLOYMENT.md`).
- **Server robustness pass**: tag filtering matches whole tags (was substring —
  `comedy` matched `dark_comedy`); updates/deletes of missing rows return 404
  instead of success; pagination limits are clamped; TMDB calls share a 10s
  timeout, hide upstream errors in production, 503 helpfully when unconfigured,
  and the streaming region is configurable (`watchProvidersRegion`); the chat
  route uses the Anthropic SDK's typed errors and answers gracefully when its
  tool loop hits the iteration cap; rate limiting sees real client IPs behind
  Nginx and sheds stale entries; reorder lives at `/api/lists/items/reorder`.
- Lint is now warning-clean and enforced: `npm run lint` runs ESLint with
  `--max-warnings 0` (CI inherits it). Page loaders were wrapped in
  `useCallback` to satisfy `react-hooks/exhaustive-deps` honestly; the one
  deliberately-curated dependency list (Watch Log's filter debounce) carries an
  explanatory suppression instead. Dead variables removed throughout.
- Multi-statement writes are now transactional: logging a viewing (viewing +
  people + list/rotation side effects), replacing a viewing's people on edit,
  and deleting a viewing or a list. A failure mid-write rolls everything back
  instead of leaving half-written data (covered by rollback tests).

### Added

- **"Unwatched first" sort on a list** — everything you haven't seen rises to the
  top, then the watched ones in the order you saw them, most recently watched at
  the very bottom. The unwatched block keeps the list's own curated order rather
  than being reshuffled. Sits alongside the existing Manual / Title / Year /
  Rating / Recently added options and is remembered per list.
- **Age certificate on titles** (G / PG / PG-13 / R for films, TV-14 / TV-MA for
  shows) — shown as a small outlined badge beside the year and runtime on the
  title page, list cards and the Tonight picks. US ratings, taken from the `Rated`
  field OMDb already returns alongside the Rotten Tomatoes / IMDb / Metacritic
  scores, so it costs no extra API calls. Titles OMDb has no certificate for (or
  that it marks "Not Rated" / "Approved") simply show no badge. New titles pick it
  up automatically; existing ones were back-filled with
  `npm run enrich:ratings -- --certs-only`.

### Fixed

- **Duplicate titles (two rows for the same film)** — every "add a title" path
  did an unconditional `INSERT`, so adding a film the library already had created
  a second row rather than reusing the first. Production had accumulated 24 such
  pairs (Weapons even sat on "Cinema flicks I missed" twice, once under each id).
  Three changes: `POST /api/titles` is now find-or-create on `tmdb_id`; Quick Add
  searches your own library alongside TMDB and hides TMDB results you already
  hold (previously it searched TMDB only, so it could never notice); and
  migration 006 merges the existing pairs — folding every viewing, list
  membership, star, disc and show-status onto the surviving row — then adds a
  UNIQUE index on `tmdb_id` so it can't recur. `npm run dedup -- --dry-run`
  previews a merge. Re-matching a title to a TMDB entry another title already
  claims now returns a clear 409 instead of a constraint error.
- **"Add to list" close (✕) unreachable on iPhone** — the bottom sheets that lack
  their own height cap (Add-to-list, Edit list, New list) had no `max-height`, so
  with many lists the sheet grew taller than the screen and, because it's anchored
  to the bottom, its top — and the ✕ — was pushed up off-screen / under the status
  bar. Capped these sheets at `max-h-[90vh]` with internal scrolling, matching the
  Log-a-viewing modal, so the header and ✕ stay on-screen and the list scrolls.
- **Edit forms zoomed and ran off-screen on iPhone** — iOS Safari auto-zooms the
  page whenever a focused text field has a font-size under 16px, and the form
  inputs were `text-sm` (14px). Focusing any field zoomed the layout so it spilled
  off to the right. Form controls are now forced to 16px on phone widths
  (`@media (max-width: 640px)` in `index.css`), which stops the zoom; desktop and
  the rest of the UI are unchanged.
- **Search results landed scrolled partway down on iPhone** — after a search, the
  keyboard/focus could leave the list scrolled past the top, hiding the best
  match. The Search page now snaps back to the top each time a new search runs.
- **Top bars hidden under the iPhone status bar (iOS PWA)** — the app draws
  edge-to-edge (`viewport-fit=cover` + a translucent status bar), but the top
  headers and the title page's Back button used fixed top padding (`pt-12` /
  `pt-14`) that didn't account for the notch/Dynamic Island, so on a notched
  iPhone the back/close controls sat behind the clock & battery and were hard to
  tap. Added a `pt-safe` utility (`calc(0.75rem + env(safe-area-inset-top))`) and
  applied it to every top bar; the inset is `0` on desktop so nothing changes
  there. The bottom safe area was already handled.
- **`PUT /api/titles/:id` returned 500** (in-app title rename was broken): the
  reserved word `cast` was unquoted and parsed as the CAST operator.
- Marking a show finished/dropped no longer empties shared lists for everyone —
  it only auto-removes once nobody is still watching/wishlisting it.
- Server errors now return JSON (not HTML), so the client can surface them; the
  app no longer renders a permanent blank screen when config fails to load.
- Dependency audit advisories cleared (root + server to zero).

## Initial development (2026-02 – 2026-05)

Built iteratively with Claude Code:

- Core app: titles, viewings with per-person ratings, multiple watchlists,
  context-aware "what to watch", family movie-night rotation.
- TMDB integration (search, enrichment, cached watch providers).
- AI chat assistant (Claude Haiku with tool use).
- Physical/digital collection tracking; per-person TV show progress.
- Drag-to-reorder, swipe-to-dismiss, per-person shortlist stars, random pick.
- PWA install support; pixel-art family avatars; identity (no-password) system.
- Configurable family via `family.config.json`; Raspberry Pi deployment.
