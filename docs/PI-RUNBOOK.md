# Movie Night — Pi Runbook

Project-specific deployment notes for the Movie Night app on Angus Pi: the
concrete paths, config files, Nginx setup, and command sequences behind the
general deployment story in [DEPLOYMENT.md](./DEPLOYMENT.md). (General Pi
operations live in `ANGUSPI_OPERATIONS.md`, a private doc kept outside this
repo.)

---

## Quick Reference

| Detail       | Value                                                                                |
| ------------ | ------------------------------------------------------------------------------------ |
| URL (home)   | `http://anguspi.local/movie-night/`                                                  |
| URL (remote) | `https://anguspi.tail485122.ts.net:8443/movie-night/` (Tailscale, private)           |
| Port         | 3001                                                                                 |
| Pi directory | `~/what-to-watch-tonight/`                                                           |
| Database     | `~/movie-night-data/movies.db`                                                       |
| pm2 process  | `movie-night`                                                                        |
| Nginx config | `/etc/nginx/sites-available/anguspi` (shared config, `location /movie-night/` block) |
| GitHub       | https://github.com/Phlashy/what-to-watch-tonight                                     |

> **This runbook covers the primary (Casey) instance.** A second, independent
> instance runs on the same Pi for another family — different checkout, port,
> database, and pm2 process, exposed publicly via Tailscale Funnel. Its own
> runbook is **`docs/MONTREAL-INSTANCE.md`** (kept private — maintainer's local
> copy, not committed). The generic mechanism is in
> [DEPLOYMENT.md](./DEPLOYMENT.md#running-more-than-one-instance).
> When you change **shared code**, deploy to *both* checkouts (see below).

---

## Config Files on Pi

These are **not in the repo** and must be copied manually:

| File                 | Location on Pi                               | Purpose                                   |
| -------------------- | -------------------------------------------- | ----------------------------------------- |
| `.env`               | `~/what-to-watch-tonight/.env`               | API keys (TMDB, Anthropic), DB path, port |
| `family.config.json` | `~/what-to-watch-tonight/family.config.json` | Family members, lists, contexts           |
| `movies.db`          | `~/movie-night-data/movies.db`               | All app data                              |

### .env contents

```
TMDB_API_KEY=<key>
DB_PATH=~/movie-night-data/movies.db
PORT=3001
ANTHROPIC_API_KEY=<key>
```

---

## Deploy Updates

> **Who runs these:** In practice, **Claude Code runs the commit → push → deploy commands**, always **asking Gordon for confirmation before pushing or deploying** (anything that leaves the local machine or touches the Pi). Gordon doesn't run `git push` or the deploy SSH by hand. The commands below are the canonical sequence Claude follows on request.

> **Deploying from away (not on home Wi-Fi):** swap `anguspi.local` for the Tailscale name `anguspi.tail485122.ts.net` in the deploy SSH below — everything else is identical. Requires Tailscale connected and any other VPN (NordVPN) paused or split-tunnelled. See `ANGUSPI_OPERATIONS.md` → Remote Access.

`client/dist/` is tracked in git. **Always build and commit before pushing** when client code changes. The Pi just pulls and restarts — it does not build.

### Server-only changes (no UI changes)

```bash
git add -A && git commit -m "..." && git push
ssh gordon@anguspi.local "cd ~/what-to-watch-tonight && git pull && pm2 restart movie-night"
```

### Client changes (any file under `client/src/`)

```bash
cd client && npm run build && cd ..
git add -A && git commit -m "..." && git push
ssh gordon@anguspi.local "cd ~/what-to-watch-tonight && git pull && pm2 restart movie-night"
```

> **Why?** The Pi doesn't have the client's node_modules and we don't want it doing builds. The built `client/dist/` files are committed to git so `git pull` is all the Pi needs.

### Shared-code changes → deploy to every instance

The commands above update the primary checkout only. A change to shared code
(anything but one instance's `.env`/`family.config.json`) must also reach the
second instance, or the two will drift:

```bash
# after pushing, update the second instance too (deploy.sh reads its .env for
# the pm2 name + port, so no per-instance flags needed):
ssh gordon@anguspi.local "cd ~/movie-night-montreal && git pull && ./scripts/deploy.sh"
```

Verify both after: `pm2 list` shows `movie-night` **and** `movie-night-montreal`
online. Full detail (ports, funnel, nginx) in the private `docs/MONTREAL-INSTANCE.md`.

### Database sync & backups

> ⚠️ **Do NOT `scp movies.db` to the Pi.** That overwrites live family history and, in WAL mode, can copy a partial database. The Pi is the source of truth.
>
> Use the managed scripts instead — see **[DATA-AND-BACKUPS.md](./DATA-AND-BACKUPS.md)** for the full protocol:
>
> - `npm run db:pull` — refresh your **local** copy from production (the normal direction).
> - `npm run db:check` — is local current with production? (also runs automatically before `npm run dev`).
> - `npm run db:push` — push local **up to** production (guarded: confirms + backs up production first). Restore/seed only.
>
> Production backs itself up **nightly at 03:00** (cron → `scripts/pi-db-backup.cjs`, keeps last 14 in `~/movie-night-data/backups/` on the Pi).

### Push config files (these are safe to scp — not data)

```bash
# Push updated family config
scp family.config.json gordon@anguspi.local:~/what-to-watch-tonight/

# Then restart the app
ssh gordon@anguspi.local "pm2 restart movie-night"
```

---

## Base Path Setup

The app runs at `/movie-night/` (not root). This requires:

1. **Vite** — `base: '/movie-night/'` in `client/vite.config.js`
2. **React Router** — `basename="/movie-night"` on `<BrowserRouter>`
3. **API calls** — `client/src/api.js` exports an `api()` helper that prepends `import.meta.env.BASE_URL` to all fetch calls
4. **Nginx** — `proxy_pass http://127.0.0.1:3001/` (trailing slash strips the prefix)

When running locally in dev mode (`npm run dev`), the base is `/` so everything works without the prefix.

---

## First-Time Setup (already done)

For reference, initial deployment steps were:

1. Cloned repo to `~/what-to-watch-tonight/`
2. `npm install` in root, server/, and client/
3. Copied `.env`, `family.config.json`, and `movies.db` from Mac via `scp`
4. Created `~/movie-night-data/` and moved DB there
5. Built client: `cd client && vite build`
6. Started with pm2 via `ecosystem.config.js`
7. Configured Nginx location block for `/movie-night/`
8. Set pm2 to auto-start on boot: `pm2 startup && pm2 save`

---

## Monitoring

```bash
# Check if running
pm2 list

# View logs
pm2 logs movie-night --lines 50

# Restart
pm2 restart movie-night
```
