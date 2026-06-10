# Audit — Outcome & Closure

**Status: COMPLETE.** Ran 2026-05-30 → 2026-06-02. All tiers (0–3) plus the
follow-on feature requests are done, tested, and deployed to production.

This is the closing bookend to the audit. The point-in-time analysis lives in
`AUDIT-ARCHITECTURE.md`, `AUDIT-UX.md`, `AUDIT-TECH-DEBT.md`, and the decision in
`AUDIT-RECOMMENDATION.md`. This file records _why we did it, what we found, what
we shipped, and what we learned_ — so the story isn't lost.

---

## Why we did it

The goal was to take a working, iteratively-AI-built family app and get it to a
state worthy of public scrutiny (open-source / Reddit) and a possible future
mobile product: polished, well-documented, well-architected, and safe to run.
Rather than guess at what needed work, we ran a full audit first.

## The verdict

**Refactor in place — do not rebuild.** The architecture was conventional and
correct (React SPA → flat Express routes → one SQLite file), the data model was
sound, the data was valuable and clean, and the visual design was already
coherent. The problems were incremental and localized, not structural. A rebuild
would have risked the years of real viewing history for no architectural gain.
(Full reasoning: `AUDIT-RECOMMENDATION.md`.)

## What we shipped (by tier)

- **Tier 0 — correctness & data integrity:** unified the rotation logic (Tonight
  and the chat assistant had disagreed), stopped "finished/dropped" from emptying
  shared lists, added a global JSON error handler, and added a client error
  boundary + "can't reach the server" retry screen.
- **Tier 1 — tests, migrations, backups, CI:** a real migration runner with a
  `schema_migrations` ledger; supertest integration tests that exercise the
  _actual_ route handlers (not reimplemented SQL); DB sync + nightly backup
  tooling; GitHub Actions CI.
- **Tier 2 — security & docs:** optional shared-password auth (off by default),
  configurable CORS, chat rate-limiting, input validation, a scoped service
  worker, Prettier + ESLint, and a consolidated `docs/` set.
- **Tier 3 — UX polish & features:** TMDB-in-Search, persistent chat history, a
  styled confirm dialog, a `viewing_people(person)` index, full list management
  (rename/icon/delete), the four sorting surfaces + list drag-reorder, the
  Tonight card-gesture rework, scroll restoration, an accessibility pass, and
  component extraction for the two largest pages.

See `CHANGELOG.md` for the itemized list.

## What we learned (the durable lessons)

1. **Always test against production data, never a stale dev copy.** The very
   first audit numbers were wrong because they were read from a stale local DB.
   This produced the single most important process change: **sync the DB before
   any work** (`npm run db:pull` / `db:check`), now baked into `npm run dev`'s
   startup heads-up and the workflow in `WORKFLOW.md`.
2. **Tests must hit the real code.** The old suite re-implemented SQL inline, so
   it couldn't catch handler bugs. Converting to real HTTP integration tests
   immediately surfaced a live production bug: `PUT /api/titles/:id` returned 500
   because the reserved word `cast` was unquoted (in-app title rename was
   broken). Several other real issues (rotation divergence, the show-status list
   wipe) were the same shape — invisible to tests-of-copies.
3. **Schema changes go through numbered, reversible migrations** — no more
   hand-edited schema drift between dev, test, and prod.
4. **The honest read was that the codebase was good.** Resisting the urge to
   rebuild was the right call; the value was in targeted hardening.

## Where things stand

- Production (`anguspi`) is current and verified after every deploy (config 200 /
  auth off, migrations applied, data counts intact).
- Open follow-ups are tracked in `KNOWN-ISSUES.md` (none are blocking).
- The day-to-day process to keep it this clean is in `WORKFLOW.md`.
