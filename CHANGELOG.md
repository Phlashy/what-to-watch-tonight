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
- Optional shared-password authentication (`APP_PASSWORD`), off by default; the
  client shows a password gate when enabled.
- Configurable CORS allowlist (`CORS_ORIGIN`).
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

### Fixed

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
