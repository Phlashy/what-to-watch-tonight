# What To Watch Tonight

A family movie night web app for managing watchlists, logging viewings, tracking a physical media collection, and deciding what to watch next. Built with React and Express, designed to run on a home network so everyone can access it from their phone or laptop.

## Features

- **Tonight** — The main decision screen. Shows what's on the watchlist for tonight's context (family night, solo, etc.) with drag-to-reorder, swipe-to-dismiss, shortlist stars, and a "Pick for me" random selector
- **Watch Log** — Browsable viewing history with per-person ratings, reviews, sorting (recent / top rated), and filters
- **Search** — Find titles in the database or search TMDB to add new ones
- **Lists** — Multiple watchlists for different contexts (family movie night, solo viewing, etc.) with priority ordering and streaming service notes
- **Ask** — Natural language chat powered by Claude that can query your database ("Whose turn is it to pick?", "What comedies have we watched this year?", "Add Inception to the family list")
- **Collection** — Track physical media (DVD, Blu-ray, digital) with format filtering
- **Streaming availability** — See where titles are available to stream, with highlights for your subscribed services (via TMDB)
- **Family rotation** — Automatic turn-taking for who picks the next movie
- **Identity system** — No passwords; each device picks a person. Per-person ratings, shortlists, and attribution
- **Pixel art avatars** — Custom SVG avatars rendered from 10x12 pixel grids
- **PWA** — Installable on iOS and macOS via "Add to Home Screen" / "Add to Dock"

## Stack

- **Frontend**: React 18, Vite 5, Tailwind CSS 3, React Router 6, @dnd-kit
- **Backend**: Node.js, Express 4, better-sqlite3
- **AI Chat**: Anthropic Claude API (Haiku) with tool use
- **Metadata**: TMDB API for posters, cast, streaming availability
- **Production**: pm2 process manager

## Quick Start

```bash
# Clone and install
git clone https://github.com/Phlashy/what-to-watch-tonight.git
cd what-to-watch-tonight
npm install
cd client && npm install && cd ..
cd server && npm install && cd ..

# Configure
cp .env.example .env
# Edit .env with your TMDB and Anthropic API keys

# Import seed data (or start fresh with an empty database)
# Place your own seed data at seed-data/final_consolidated.json
# npm run import

# Start development
npm run dev
```

The app will be available at `http://localhost:3000` (dev) with the API on port 3001.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start both client (Vite) and server (nodemon) for development |
| `npm run build` | Build the client for production |
| `npm run deploy` | Build client + start/restart production server (pm2) |
| `npm run prod:stop` | Stop the production server |
| `npm run prod:status` | Check production server status |
| `npm run prod:logs` | Tail production server logs |
| `npm run import` | Import seed data into the database |
| `npm run enrich` | Fetch TMDB metadata for un-enriched titles |

## Dev vs Production

**Development** runs two servers: Vite on port 3000 (with hot reload) proxying API calls to Express on port 3001 (with nodemon auto-restart).

**Production** runs a single Express server on port 3001 that serves the built client assets and the API from the same origin. Managed by pm2.

`npm run dev` automatically stops pm2 if it's running. `npm run deploy` always rebuilds the client before restarting pm2. No manual process management needed.

## Database

SQLite via better-sqlite3. The database file lives outside the repo (default: `~/movie-night-data/movies.db`). Schema migrations run inline on startup.

## Environment Variables

See `.env.example` for the full list. You'll need:
- `TMDB_API_KEY` — Free from [TMDB](https://www.themoviedb.org/settings/api)
- `ANTHROPIC_API_KEY` — From [Anthropic Console](https://console.anthropic.com/) (required for chat feature)

## Built With Claude Code

This project was built collaboratively with [Claude Code](https://claude.ai/code), Anthropic's agentic coding tool. The entire app — frontend, backend, database schema, TMDB integration, drag-and-drop, AI chat with tool use, pixel art avatars, devops scripts — was developed through iterative conversation and code generation.

## License

MIT
