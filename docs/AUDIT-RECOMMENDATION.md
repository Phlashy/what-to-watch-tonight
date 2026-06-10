# Audit — Recommendation: Refactor vs. Rebuild (Phase 2)

**Date:** 2026-05-30
**Decision required from Gordon before any Phase 3 work begins.**

---

## The verdict: **Option A — Refactor in place.** Do not rebuild.

### Why (the honest version)

You told me to be direct, so: **this codebase is not a mess, and a rebuild would be the wrong call.** Iteratively-AI-built projects often accumulate structural rot — tangled state, copy-paste divergence, dead abstractions, security holes. This one largely avoided that. The evidence:

- **The architecture is conventional and correct.** Thin React SPA → flat Express route modules → one SQLite file. There's nothing exotic to unwind, no framework fighting itself, no global-state spaghetti.
- **The data model is sound** and, crucially, **the data is valuable and clean** (485 viewings, 652 titles, years of history). A rebuild's main risk is always the migration; here there's no reason to take that risk — the schema is fine and can evolve in place.
- **SQL is parameterized everywhere; no injection, no XSS, no crashes** in normal use.
- **There's a real, green test suite and abundant docs** — a foundation to build on, not rubble.
- **The visual design is coherent** — it already looks like one app. That's the expensive thing to get right, and it's done.

The problems that exist are **incremental and localized**, not structural: a duplicated rotation implementation, a test suite that tests copies instead of the code, missing cross-cutting concerns (error handling, auth, input limits), and some oversized files. Every one of these is a bounded, well-understood fix. **Refactoring is cheaper and far less risky than starting over**, and it preserves the years of polish already invested.

A rebuild would only be justified if you wanted to change the _fundamental_ tech (e.g. go server-rendered, or native-first now). You don't need to for the stated near-term goal ("polished, well-documented, well-architected web app worthy of public scrutiny"). Keep the stack; clean it up.

---

## Suggested tech stack: **keep current, add guardrails**

| Decision        | Recommendation                                                                                                                                                                | Justification                                                                                                                         |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend        | **Keep** React 18 + Vite + Tailwind + react-router                                                                                                                            | Modern, fast, appropriate. No reason to churn.                                                                                        |
| Backend         | **Keep** Express + better-sqlite3                                                                                                                                             | Perfect fit for single-file, single-host, family-scale. Synchronous sqlite is a feature here.                                         |
| Language        | **Stay JS for now; adopt JSDoc-typed + `checkJs`** rather than a full TS migration                                                                                            | Gets you type-checking on the risky contracts (JSON columns, person strings) without a disruptive rewrite. Full TS is optional later. |
| Add             | **ESLint + Prettier**, **a real migration runner**, **a global error handler**, **basic auth option**, **a backup step**, **CI (GitHub Actions)**                             | These are the actual gaps. They're additive, not rewrites.                                                                            |
| Future (mobile) | When you get there: this Express+SQLite API is a clean backend for a React Native / Expo client, _or_ migrate SQLite→Turso/libSQL for sync. **Don't pre-build for this now.** | Avoid speculative complexity; the current shape doesn't block it.                                                                     |

---

## What to preserve (do not touch)

- **The database and all data.** Migrate schema in place with a backup-first step. Never recreate.
- **The family.config.json model** — externalized personalization is a genuine strength and exactly right for self-hosters.
- **The visual design language** — dark slate/amber theme, card patterns, bottom-sheet modals, safe-area handling.
- **Proven UX flows that work:** LogViewing (search-local-and-TMDB-in-one), the identity/PersonPicker pattern, the Tonight chooser-split, watch-provider caching.
- **The test discipline** (just point it at the real code — see below).
- **The deployment model** (pm2 + Nginx + committed dist) — it works for the Pi; refine, don't replace.

---

## What to change, and why — prioritized action plan

Complexity: **S** ≈ <½ day · **M** ≈ ~1–2 sessions · **L** ≈ multi-session.
Each item names the _why_ so the value is clear.

### Tier 0 — Correctness & data integrity (do first)

| #   | Action                                                                                                                                                                                                                                                                                                                                                                                                                            | Cx  | Why                                                                                                                              |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | -------------------------------------------------------------------------------------------------------------------------------- |
| 0.1 | **Make the chat tab's rotation use the same source as Tonight.** The Tonight path (`settings.family_rotation_next` counter) is correct and verified. Point `chat.js → toolGetFamilyRotation` at it; delete the dead `family_rotation_next_override` path and the `viewing_people.role='chooser'` logic (role is 'chooser' for everyone, so it's meaningless).                                                                     | S–M | Today Tonight and Ask can disagree about whose turn it is — the one question the app exists to answer. (`AUDIT-TECH-DEBT.md` §2) |
| 0.2 | **Add a global Express error handler + JSON 404**, and wrap DB routes so unexpected throws return sanitized `{error}` JSON, not HTML.                                                                                                                                                                                                                                                                                             | S   | Client can't currently surface server errors; users get blank screens.                                                           |
| 0.3 | **Catch load errors on the client**: add an error boundary, give each fetch an error+retry state, and make `FamilyContext` show a real "can't reach server" screen instead of rendering `null` forever.                                                                                                                                                                                                                           | M   | The single biggest reliability-perception issue.                                                                                 |
| 0.4 | **Fix the `finished`/`dropped` → delete-from-ALL-lists behavior.** Make it per-list or confirm-with-undo; a per-person status should not silently empty shared watchlists. (Watch Log is unaffected — only `list_items`.) **Priority raised after live re-check:** show-status is actively used (12 rows: 6 finished / 6 watching on the production DB), so this has likely already removed shows from shared lists unexpectedly. | S   | Active feature silently mutating shared lists for everyone.                                                                      |
| 0.5 | _(optional)_ **Backfill `picked_by` / `role` on historical viewings** if you want the chat/history to reflect who chose older movie nights. Not required — `picked_by` already works for app-logged viewings; the ~500 seed-imported ones just lack it.                                                                                                                                                                           | S   | Nice-to-have data completeness, not a bug.                                                                                       |

### Tier 1 — Make the tests real, add safety nets

| #   | Action                                                                                                                                                           | Cx  | Why                                                                  |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | -------------------------------------------------------------------- |
| 1.1 | **Refactor routes to call a thin data-access layer**, then point the existing tests at _that_ (or supertest the HTTP routes). Stop re-implementing SQL in tests. | M   | Tests currently prove copies, not the app. (`AUDIT-TECH-DEBT.md` §5) |
| 1.2 | **Add a real migration runner** (numbered, ordered, reversible) and move the `db.js` ALTER/CREATE statements into it. Fold them into the schema-of-record.       | M   | Brief requires documented, reversible migrations.                    |
| 1.3 | **Add a backup step** to deploy/import (copy `movies.db` with a timestamp before any write-y operation).                                                         | S   | The data is precious and irreplaceable.                              |
| 1.4 | **`npm audit fix`** across all three trees; add an `npm audit` (and test) **GitHub Actions CI**.                                                                 | S   | Public-scrutiny hygiene.                                             |

### Tier 2 — Public-release readiness (security & docs)

| #   | Action                                                                                                                                                                                                                                                                                                                                                        | Cx  | Why                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | --------------------------------------------------------------------------------------- |
| 2.1 | **Optional auth + configurable CORS origin + rate-limit on `/api/chat`** (a single shared-secret / basic-auth toggle is enough for self-hosters who expose it).                                                                                                                                                                                               | M   | Required before anyone safely puts this on the internet.                                |
| 2.2 | **Input validation/limits** (explicit `express.json({limit})`, length caps on notes/titles/names) via a small validation helper.                                                                                                                                                                                                                              | S   | Prevents junk/oversized writes; cheap correctness.                                      |
| 2.3 | **Consolidate documentation** into one canonical `docs/` tree. Merge/retire the overlapping `ARCHITECTURE.md` + stale `AUDIT.md` + `KNOWN-ISSUES.md`; produce the brief's required set: top-level `README` (with screenshots), `docs/ARCHITECTURE.md` (with the Mermaid ER), `docs/CONTRIBUTING.md` (matching reality), `docs/DEPLOYMENT.md`, `CHANGELOG.md`. | M   | Brief calls docs "non-negotiable"; today they're abundant but fragmented/contradictory. |
| 2.4 | **Fix the service-worker registration** to `/movie-night/sw.js` with matching scope (and a cache the offline fallback can actually use).                                                                                                                                                                                                                      | S   | Avoids interfering with other apps on the shared host; makes PWA offline real.          |
| 2.5 | **ESLint + Prettier + editorconfig**, and adopt **JSDoc + `checkJs`** on the server data layer.                                                                                                                                                                                                                                                               | M   | Invites contributors; documents the string/JSON contracts.                              |

### Tier 3 — UX polish & expected features

| #   | Action                                                                                                                                                                                  | Cx  | Why                                                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ------------------------------------------------------ |
| 3.1 | **Tame the card gesture overload** on Tonight — explicit handles/buttons over stacked tap+swipe+drag; wire dnd-kit keyboard sensor.                                                     | M   | Biggest mobile-usability risk. (`AUDIT-UX.md` §1)      |
| 3.2 | **Accessibility pass**: `aria-label` on icon buttons, `role="dialog"`/focus-trap/Escape on modals, contrast fixes on secondary text, ≥44px touch targets.                               | M   | Table-stakes for public + future app-store.            |
| 3.3 | **Make Search search TMDB too** (or merge Search with the Add flow) so the obvious path isn't a dead end.                                                                               | S   | Removes a confusing dead end.                          |
| 3.4 | **List management**: rename/delete lists, data-driven icons (replace hardcoded `LIST_ICONS`); **delete-title** path; surface a "show hidden" control.                                   | M   | Expected CRUD that's currently missing.                |
| 3.5 | **Persist chat history** (localStorage or a `chat_messages` table); consider streaming responses.                                                                                       | S   | Known gap; cheap win.                                  |
| 3.6 | **Replace native `confirm`/`alert`** with the app's own modal/undo pattern.                                                                                                             | S   | Visual coherence + undo for destructive actions.       |
| 3.7 | **Extract oversized components** (`TitleDetail`, `WhatToWatch`) into per-component files; pull shared helpers (rating-aggregation SQL, provider dedup, JSON parse) into one place each. | M   | Maintainability; prerequisite for safe further change. |
| 3.8 | **Add the missing index** `viewing_people(person)` and replace per-row rating subqueries with a shared fragment/view.                                                                   | S   | Cheap performance + de-dup.                            |

### Tier 4 — Forward-looking (only when you choose to)

- Per-person "for me" surfaces (my shortlist / ratings / stats UI).
- Episode-level show logging (needs a data-model decision first).
- "It's your turn" notifications.
- Responsive/desktop layout beyond the centered column.
- Eventual SQLite→libSQL/Turso if you want multi-device sync for a hosted product.

---

## Proposed file/folder structure (target after refactor)

Minimal disruption — this is an evolution of what's there, not a reshuffle for its own sake.

```
what-to-watch-tonight/
├── README.md                     # public overview + screenshots
├── CHANGELOG.md
├── package.json                  # workspaces: client, server  (dedupe better-sqlite3)
├── .eslintrc / .prettierrc / .editorconfig / .nvmrc
├── .github/workflows/ci.yml      # install · lint · test · npm audit
├── ecosystem.config.js
├── family.config.example.json
├── docs/
│   ├── ARCHITECTURE.md           # canonical (absorbs root ARCHITECTURE.md + this audit's diagrams)
│   ├── CONTRIBUTING.md           # matches reality
│   ├── DEPLOYMENT.md             # Pi/pm2/Nginx + future cloud
│   ├── AUDIT-*.md                # this audit set (kept for history)
│   └── screenshots/
├── server/
│   ├── index.js                  # app wiring only
│   ├── db/
│   │   ├── index.js              # connection + pragmas
│   │   └── migrations/           # numbered, reversible (000x_*.up/down.sql) + runner
│   ├── lib/                      # shared: errors, validation, json, rating-sql, auth, rate-limit
│   ├── data/                     # data-access layer (testable, no HTTP)  ← NEW
│   │   ├── titles.js  viewings.js  lists.js  rotation.js  shortlists.js
│   │   ├── collection.js  showStatus.js  stats.js
│   ├── routes/                   # thin HTTP wrappers over data/ + tmdb.js + chat.js
│   └── package.json
├── client/
│   ├── src/
│   │   ├── api/                  # api.js + a useFetch hook with error/retry
│   │   ├── context/  hooks/
│   │   ├── components/           # extracted: WatchCard, ViewingItem, modals, ErrorBoundary…
│   │   ├── pages/
│   │   └── lib/                  # parseJSON, formatting, constants (tags, ratings)
│   └── package.json
├── scripts/                      # import, enrich, dedup, backup, deploy
├── seed-data/                    # example seed + schema-of-record reference
└── tests/
    ├── data/                     # unit tests against server/data/* (REAL code)
    ├── routes/                   # supertest HTTP integration tests
    └── client/                   # (later) component + e2e
```

Key structural moves: **introduce `server/data/` (the testable layer)**, **a real `db/migrations/` runner**, **`server/lib/` for the cross-cutting concerns**, and **extract the big client components**. Everything else stays where it is.

---

## Suggested sequencing

1. **Tier 0** (correctness/data) — highest value, lowest regret, partly user-facing.
2. **Tier 1** (real tests + migrations + backup + CI) — the safety net that makes everything after it safe.
3. **Tier 2** (security + docs consolidation) — the "worthy of public scrutiny" bar.
4. **Tier 3** (UX polish) — iterate with the family.
5. **Tier 4** — only when a concrete goal (e.g. the mobile product) demands it.

Each tier is independently shippable, every step keeps the app working, and nothing requires touching the precious data except behind a backup.

---

## ⏸️ Phase 3 gate

Per the brief, **I'm stopping here and will not start Phase 3 until you explicitly say go.** When you're ready, tell me which tier(s) to execute (e.g. "do Tier 0 and Tier 1") and I'll work through them one concern per commit, on a branch, tests green at every step.
