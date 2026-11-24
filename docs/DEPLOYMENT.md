# Deployment

Three environments: local development, the Raspberry Pi (production today), and
a future cloud option.

---

## Local development

```bash
npm run dev
```

Runs the Vite client on **:3000** (hot reload) proxying `/movie-night/api` to the
Express server on **:3001** (nodemon). The app is at `http://localhost:3000/movie-night/`.

Environment (`.env`, see `.env.example`):

| Var                 | Required | Default                        | Purpose                                 |
| ------------------- | -------- | ------------------------------ | --------------------------------------- |
| `TMDB_API_KEY`      | yes      | —                              | Metadata, posters, watch providers      |
| `ANTHROPIC_API_KEY` | for chat | —                              | Claude assistant                        |
| `PORT`              | no       | 3001                           | Server port                             |
| `DB_PATH`           | no       | `~/movie-night-data/movies.db` | SQLite file (outside the repo)          |
| `APP_PASSWORD`      | no       | unset                          | Optional shared password (see Security) |
| `CORS_ORIGIN`       | no       | allow all                      | Comma-separated CORS allowlist          |
| `NTFY_TOPIC`        | no       | unset (no alerts)              | ntfy.sh topic for password-guess alerts |
| `WTWT_REPORT_NAME`  | no       | `Movie Night`                  | Instance name shown in those alerts     |

The database lives **outside the repo**. The schema is created/updated
automatically on startup by the migration runner — no manual step.

---

## Production (Raspberry Pi)

The app runs under **pm2** behind **Nginx** at `http://anguspi.local/movie-night/`.
The built client (`client/dist/`) is committed to git, so the Pi only pulls and
restarts — it never builds.

**Deploy the canonical sequence** (Claude Code runs this on request, after
confirmation — see [PI-RUNBOOK.md](./PI-RUNBOOK.md)):

```bash
# If client source changed, rebuild first so the committed bundle is current:
npm run build

git add -A && git commit -m "…" && git push

ssh gordon@anguspi.local "cd ~/what-to-watch-tonight && git pull && pm2 restart movie-night"
```

- **Full Pi specifics** (paths, Nginx block, config files that live only on the
  Pi, first-time setup): **[PI-RUNBOOK.md](./PI-RUNBOOK.md)**.
- **Database sync & backups** (the Pi is the source of truth; never `scp` the DB;
  use `npm run db:pull`): **`docs/DATA-AND-BACKUPS.md`**.

On restart the migration runner applies any pending migrations and records them
in `schema_migrations` — safe and idempotent against the existing database.

---

## Running more than one instance

The same codebase can run several fully independent instances on one host (e.g.
a second family's copy). Each instance is a **separate git checkout** with its
own `.env`, `family.config.json`, database, and pm2 process — they share only
the code. Nothing about identity or data is baked into the repo, so `git pull`
updates any instance without touching who it belongs to.

What makes an instance distinct is entirely in its `.env`:

| Var                 | Purpose                                                                                                                |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `PORT`              | Its own port (each instance listens separately)                                                                        |
| `DB_PATH`           | Its own database file, outside the repo                                                                                |
| `WTWT_PM2_NAME`     | The pm2 process name (`scripts/deploy.sh` reads this; defaults to `movie-night`)                                       |
| `APP_PASSWORD`      | **Required** if the instance is exposed publicly (see Security posture)                                                |
| `ANTHROPIC_API_KEY` | Omit it to disable the Ask tab — `/api/config` reports `chatEnabled: false` and the client hides the tab automatically |

Seed a fresh instance's lists/titles with the generic, idempotent seeder:

```bash
node scripts/seed-lists.js <seed-file.json>   # then: npm run enrich
```

Deploying a **shared code change** means bringing every instance's checkout up
to date, not just the primary one — pull + restart each. A concrete, deployed
example (ports, nginx, public exposure, monitoring) lives in the maintainer's
`docs/MONTREAL-INSTANCE.md` runbook.

---

## Security posture

- **Default (LAN/Tailscale):** no authentication — access is controlled at the
  network layer. This is the intended setup for a home install.
- **Exposing the app more widely:** set `APP_PASSWORD` to require a shared
  password (the client prompts once and remembers it), and set `CORS_ORIGIN` to
  your domain(s). The chat endpoint is rate-limited regardless.
- **Wrong-password limit:** each visitor address gets **20 wrong guesses per
  hour**. The 20th locks that address out until the hour (counted from its
  first wrong guess) is up — even the correct password is refused meanwhile,
  otherwise the limit wouldn't stop guessing. Requests that send no password at
  all (a first visit) aren't counted. If `NTFY_TOPIC` is set, the 20th wrong
  guess also sends a push alert via [ntfy.sh](https://ntfy.sh) naming the
  address. Counts live in memory, so a restart clears them.
- **The limit needs the visitor's real address.** The server reads it from the
  `X-Forwarded-For` header set by the reverse proxy in front of it (`trust
proxy` is `loopback`). If the proxy doesn't send that header, every visitor
  looks like `127.0.0.1` — in that case the server deliberately **never locks
  anyone out** (one person's typos would lock out the whole household) but
  still counts and still sends the alert.

---

## Future: cloud deployment

The Express + SQLite design ports cleanly to a single small VM or container:

1. Provision a host with Node 20.
2. Set `.env` (include `APP_PASSWORD` and `CORS_ORIGIN` for a public host).
3. `npm ci` in root + `server/`; build the client (`npm run build`).
4. Run the server with a process manager (pm2/systemd) behind a TLS reverse
   proxy (Caddy/Nginx).
5. Put `DB_PATH` on a persistent volume and schedule backups (the
   `scripts/pi-db-backup.cjs` pattern works anywhere).

For multi-device sync or higher concurrency later, SQLite can be migrated to
libSQL/Turso without changing the query layer.
