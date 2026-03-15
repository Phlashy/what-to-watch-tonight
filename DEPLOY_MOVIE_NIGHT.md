# Movie Night — Pi Deployment

Project-specific deployment notes for the Movie Night app on Angus Pi. For general Pi operations, see [ANGUSPI_OPERATIONS.md](./ANGUSPI_OPERATIONS.md).

---

## Quick Reference

| Detail | Value |
|--------|-------|
| URL | `http://anguspi.local/movie-night/` |
| Port | 3001 |
| Pi directory | `~/what-to-watch-tonight/` |
| Database | `~/movie-night-data/movies.db` |
| pm2 process | `movie-night` |
| Nginx config | `/etc/nginx/sites-available/movie-night` |
| GitHub | https://github.com/Phlashy/what-to-watch-tonight |

---

## Config Files on Pi

These are **not in the repo** and must be copied manually:

| File | Location on Pi | Purpose |
|------|---------------|---------|
| `.env` | `~/what-to-watch-tonight/.env` | API keys (TMDB, Anthropic), DB path, port |
| `family.config.json` | `~/what-to-watch-tonight/family.config.json` | Family members, lists, contexts |
| `movies.db` | `~/movie-night-data/movies.db` | All app data |

### .env contents
```
TMDB_API_KEY=<key>
DB_PATH=~/movie-night-data/movies.db
PORT=3001
ANTHROPIC_API_KEY=<key>
```

---

## Deploy Updates

From the Pi (SSH in first: `ssh gordon@anguspi.local`):

```bash
cd ~/what-to-watch-tonight
git pull
cd server && npm install && cd ..
cd client && npm install && cd ..
cd client && vite build && cd ..
pm2 restart movie-night
```

Or from your Mac, push data/config changes:
```bash
# Push updated database
scp ~/movie-night-data/movies.db gordon@anguspi.local:~/movie-night-data/

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
