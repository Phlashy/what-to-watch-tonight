# Data, Sync & Backups

The single source of truth for _which database is real_ and how to stay in sync with it. Read this first if you're returning to the project after a while.

---

## The mental model (read this)

There are **two copies** of `movies.db`, and they are **not** automatically in sync:

| Copy           | Location                                           | Role                                                                                                                         |
| -------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Production** | **Pi** (`anguspi`): `~/movie-night-data/movies.db` | **The real one.** The family uses the live app every day; this copy is always the truth.                                     |
| **Dev**        | **Mac**: `~/movie-night-data/movies.db`            | A throwaway working copy for local development. **Drifts stale** because it only changes when you run `npm run dev` locally. |

> **The trap this protocol exists to prevent:** developing/testing against the Mac copy while it's weeks out of date — or, worse, pushing the stale Mac copy _up_ and clobbering real family history. (This actually happened during the 2026-05-30 audit: the Mac copy was ~2.5 months behind.)

**Golden rules**

1. **Pull before you work.** Production → Mac. `npm run db:pull`.
2. **`npm run dev` checks for you.** It warns loudly if your local copy is stale (it won't block you).
3. **Never push casually.** Mac → Pi overwrites real data. Only via `npm run db:push`, which forces a confirmation and backs up production first.
4. **The data is precious.** Both machines keep timestamped backups; the Pi backs itself up nightly.

---

## Everyday commands

```bash
npm run db:check   # Is my local copy current with production? (read-only, safe)
npm run db:pull    # Refresh local copy FROM production. Run this before dev work.
npm run dev        # Starts dev — automatically runs db:check first and warns if stale.
```

`npm run dev` runs `db:check` via a `predev` hook. If your local DB is behind, you'll see:

```
⚠️  DB IS STALE — local dev DB is behind production:
      local:      512 viewings, latest 2026-05-10 ...
      production: 528 viewings, latest 2026-05-30 ...
    Refresh with:  npm run db:pull
```

…and dev still starts (the guard never blocks — the Pi might be off, or you might just be tweaking CSS). If the Pi is unreachable it prints "couldn't verify" and continues.

---

## How sync works (and why it's safe)

The app runs SQLite in **WAL mode** (write-ahead logging). Recent writes can live in a `-wal` sidecar file that a naive `scp` of `movies.db` would miss — that's a silent way to copy a _partial_ database. So every transfer uses SQLite's **online-backup API** to take a _transactionally consistent snapshot_, even while the family is using the app.

- **`scripts/db-pull.sh`** (`npm run db:pull`): snapshots production on the Pi → downloads it → runs `PRAGMA integrity_check` and a sanity row-count → **backs up your current local DB** to `~/movie-night-data/backups/movies-mac-<timestamp>.db` → installs the fresh copy → clears stale `-wal`/`-shm`. Keeps the last 10 Mac backups.
- **`scripts/db-check.sh`** (`npm run db:check`): compares viewing count + latest viewing timestamp between local and the Pi. Exit 0 = fresh or Pi-unreachable; exit 1 = stale.
- **`scripts/db-push.sh`** (`npm run db:push`): the dangerous direction. Shows both row counts, makes you **type the production count to confirm**, **backs up production on the Pi first** (`movies-prod-<timestamp>.db`), then installs. Use only to restore or seed.

All three accept env overrides (`PI_HOST`, `LOCAL_DB`, etc.) if paths ever change.

---

## Backups

| Where                                                | What                                                 | When                                                                                 | Retention |
| ---------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------ | --------- |
| **Pi** `~/movie-night-data/backups/movies-prod-*.db` | Consistent snapshot of production                    | **Nightly 03:00** via cron (`scripts/pi-db-backup.cjs`), plus before every `db:push` | last 14   |
| **Mac** `~/movie-night-data/backups/movies-mac-*.db` | Your local copy, just before each pull overwrites it | On every `npm run db:pull`                                                           | last 10   |

The Pi cron job (installed in the Pi's crontab):

```cron
0 3 * * * cd ~/what-to-watch-tonight && /usr/bin/node scripts/pi-db-backup.cjs >> ~/movie-night-data/backups/backup.log 2>&1
```

`pi-db-backup.cjs` is committed to the repo, so `git pull` on the Pi keeps it current. Check it's running:

```bash
ssh gordon@anguspi.local 'tail -5 ~/movie-night-data/backups/backup.log; ls -1t ~/movie-night-data/backups/ | head'
```

> **Other instances back up independently.** A second instance (see
> [DEPLOYMENT.md](DEPLOYMENT.md#running-more-than-one-instance)) has its own DB
> and its own backup cron — `pi-db-backup.cjs` takes `WTWT_DATA_DIR` to point at
> that instance's data dir. The `db:pull`/`db:push` sync commands above are wired
> to the **primary** database only; don't run them against another instance.

### Restoring production from a backup

```bash
# On the Pi: put the chosen backup in place, clear WAL, restart.
ssh gordon@anguspi.local '
  cp ~/movie-night-data/backups/movies-prod-YYYYMMDD-HHMMSS.db ~/movie-night-data/movies.db &&
  rm -f ~/movie-night-data/movies.db-wal ~/movie-night-data/movies.db-shm &&
  pm2 restart movie-night'
```

(Or pull a good copy to the Mac, inspect it, and `npm run db:push` it back up.)

---

## Quick reference for "I'm back after a while"

```bash
npm run db:check     # see where you stand
npm run db:pull      # get current
npm run dev          # work (guard re-checks every time)
```

That's the whole protocol.
