# Contributing

Thanks for taking a look! This is a self-hosted family movie-tracking app. It's
small and approachable — a React SPA + an Express/SQLite API.

> For the day-to-day order of operations (sync → branch → gate → commit →
> deploy), see [WORKFLOW.md](WORKFLOW.md). This file is the detailed reference.

## Getting set up

```bash
git clone https://github.com/Phlashy/what-to-watch-tonight.git
cd what-to-watch-tonight
npm install                 # root (orchestration + test deps)
npm install --prefix server
npm install --prefix client

cp .env.example .env        # add your TMDB + (optional) Anthropic keys

# Optional: import seed data, or start with an empty DB
# npm run import

npm run dev                 # client on :3000, API on :3001
```

`npm run dev` runs the client (Vite, hot reload) and the server (nodemon)
together, and prints a heads-up if your local database is stale relative to
production (see `docs/DATA-AND-BACKUPS.md`).

## Project layout

```
server/
  index.js          app wiring + middleware
  db.js             opens SQLite, runs migrations
  lib/              rotation, show-status, validate, auth, rate-limit, migrate
  migrations/       numbered, reversible schema migrations
  routes/           one file per resource (thin HTTP over the db)
client/src/
  pages/ components/ context/ api.js utils.js
tests/              node --test + supertest integration tests
docs/               architecture, deployment, contributing, data/backups, audit
```

## Code style

- Prettier + EditorConfig define formatting: **single quotes, 2-space indent,
  semicolons, 100-col width**. Run `npm run format` (or `npm run format:check`).
- `const` by default; `let` only when reassigning; never `var`.
- Comments explain _why_, not _what_. JSDoc on exported functions/modules.
- Keep route handlers thin; put reusable logic in `server/lib/` (and unit-test it).

## The golden rules (bug fixing)

1. **Never fix a bug without a test.** Write a test that reproduces it (it should
   fail), fix the bug, watch it pass — and keep the rest of the suite green.
2. **Run the full suite after every change** (`npm test`), not just your test.
3. **Make the smallest change that solves the problem.** Don't mix a refactor
   into a bug fix.
4. **Understand before you change.** The previous approach may be protecting
   something not obvious yet.
5. **One concern per commit.** Conventional-commit style (`feat:`, `fix:`,
   `test:`, `docs:`, `chore:`).
6. **Update the docs in the same change.** A change isn't done until the docs
   match it — `CHANGELOG.md` for anything user-facing, `KNOWN-ISSUES.md` when you
   open/close an issue, and the relevant `docs/` file when you change a route,
   the schema, or a data flow. (See the "Definition of done" in
   [WORKFLOW.md](WORKFLOW.md).) Treating docs as a later milestone is how they
   drift.

## Testing

- `npm test` runs the suite (`node --test tests/*.test.js`).
- Tests build an in-memory database via the **same migration runner** as
  production (`createTestDb`) and exercise the **real route handlers** over HTTP
  via `createTestApp(db)` + supertest — not reimplemented SQL.
- **Adding/changing a route?** Add an integration test in `tests/`. Cover the
  happy path plus the error paths (400/404/409, etc.).
- **Changing the schema?** Add a new numbered migration in `server/migrations/`
  (with `up`/`down`); never edit an already-applied migration.

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs on every push/PR: installs all
three trees, runs the tests, builds the client, and fails on high/critical
`npm audit` advisories. Keep it green.

## Pull requests

1. Branch from `main`.
2. Make a focused change with tests; run `npm test` and `npm run format`.
3. Open a PR describing what changed and why. CI must pass.

## Self-review prompt

Before you push, ask yourself: _"Would I be comfortable showing this to a senior
engineer? Anything here I'd be embarrassed by?"_ It's a surprisingly effective
last pass.
