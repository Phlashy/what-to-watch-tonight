# The Development Loop

The order of operations for working on this app and keeping it clean. If you only
read one doc before sitting down to make a change, read this one. (Detailed
rules: `CONTRIBUTING.md`; deploys: `DEPLOYMENT.md`; data: `DATA-AND-BACKUPS.md`.)

> **Production is on the Pi (`anguspi`). Your Mac copy of the database is a
> disposable dev copy.** The single most important habit is step 1.

## Each work session

1. **Sync the database first.** `npm run db:pull` (or `npm run db:check` to just
   compare). Never develop or reason about data against a stale local copy — that
   mistake is what the whole audit's biggest lesson came from.
2. **Branch from `main`** for anything non-trivial. (Tiny doc tweaks can go
   straight to `main`.)
3. **Work in small slices** — one concern at a time. Don't mix a refactor into a
   bug fix.
4. **Fixing a bug? Write the failing test first**, then fix it, then watch it
   pass. Never fix a bug without a test.
5. **Schema change? Add a new numbered migration** in `server/migrations/` with
   `up`/`down`. Never edit a migration that has already been applied.

## Before every commit — the gate

Run all four, all green:

```bash
npm run format      # Prettier
npm run lint        # ESLint (0 errors, 0 warnings — the script enforces --max-warnings 0)
npm test            # full suite — not just your new test
npm run build       # client builds clean
```

Then **verify in the browser** for anything user-facing — tests don't catch
layout, gestures, or "does it actually feel right."

## Definition of done — update the docs

A change isn't done when the code works; it's done when the docs match it. Docs
are a **per-change habit, not a milestone you finish once** — letting them drift
is exactly how this repo ended up with a stale changelog and a "known issues"
list full of already-fixed items. Before you commit, update whichever apply:

- **`CHANGELOG.md`** — anything user-facing (a feature, a fix, a visible change).
- **`KNOWN-ISSUES.md`** — if you _closed_ an issue (move it to Resolved) or
  _discovered_ one (add it to Open).
- **The affected doc** — if you changed a route, the schema, a data flow, or the
  deploy steps, update `docs/ARCHITECTURE.md` / `docs/DEPLOYMENT.md` /
  `docs/DATA-AND-BACKUPS.md` to match.
- **This file / `CONTRIBUTING.md`** — if you changed how the work itself is done.

Rule of thumb: if someone reading the docs would now be _misled_ by what you
changed, the doc update is part of the change — not a follow-up.

## Commit & push

6. **Commit** — conventional style (`feat:`, `fix:`, `test:`, `docs:`, `chore:`),
   one concern per commit, ending with the `Co-Authored-By` line. Fold the doc
   updates above into the same commit (or a `docs:` commit alongside it) — don't
   leave them for "later."
7. **Push** — CI (`.github/workflows/ci.yml`) re-runs the gate on every push.
   Keep it green.

## Deploy (only when you decide to)

Production changes are deliberate. The Pi **never builds** — it serves the
`client/dist` bundle committed to git (CI fails if the bundle is stale). The
full sequence (see `DEPLOYMENT.md` and `PI-RUNBOOK.md`):

1. **Back up the prod DB first** — on the Pi:
   `node scripts/pi-db-backup.cjs` (online-backup API, safe while the family is
   using the app).
2. **Build & push from the Mac** — if client source changed, `npm run build`
   and commit the refreshed `client/dist` alongside it; then push.
3. **On the Pi**: clear any stray local changes (`git checkout -- .`), then
   `git pull --ff-only origin main`.
4. **`pm2 restart movie-night`** — migrations apply automatically on startup.
5. **Verify live**: `/api/config` returns 200 with auth off (family not locked
   out), the migration ledger is current, and title/viewing counts match the
   backup.

## The self-review pass

Before pushing: _"Would I be comfortable showing this to a senior engineer?
Anything here I'd be embarrassed by?"_ It catches a surprising amount.
