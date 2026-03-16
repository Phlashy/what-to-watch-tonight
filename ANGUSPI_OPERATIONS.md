# Angus Pi — Operations Guide

Central reference for the Casey home server (Raspberry Pi 5, 4GB RAM). This Pi hosts multiple web apps accessible on the home network.

---

## Access

| Detail | Value |
|--------|-------|
| Hostname | `anguspi` |
| Local URL | `http://anguspi.local` |
| IP address | `10.0.0.76` (may change if router reassigns) |
| SSH | `ssh gordon@anguspi.local` |
| SSH key | ed25519 (in `~/.ssh/id_ed25519` on Gordon's Mac) |
| OS | Raspberry Pi OS Trixie (Debian 13), 64-bit Lite (headless) |
| Password | *(stored locally, not in repo)* |

> If `anguspi.local` doesn't resolve, use the IP directly: `ssh gordon@10.0.0.76`

### Claude Code SSH Access

**Claude Code can (and should) SSH into the Pi directly** rather than asking the user to run commands manually and relay output. Key-based auth is set up — no password needed.

```bash
# Run a command on the Pi from Claude Code:
ssh gordon@anguspi.local "<command>"

# Examples:
ssh gordon@anguspi.local "pm2 list"
ssh gordon@anguspi.local "cd ~/what-to-watch-tonight && git pull"
ssh gordon@anguspi.local "pm2 logs movie-night --lines 20"
```

This is the **preferred method** for all Pi operations: deploying code, checking logs, restarting services, debugging issues, etc. It avoids the slow back-and-forth of the user copying commands into Terminal and pasting output back.

> **Requires**: The Mac running Claude Code must have the ed25519 key at `~/.ssh/id_ed25519` (generated during initial setup). If SSH fails with "Permission denied", check that the key exists and that the Pi's `~/.ssh/authorized_keys` contains the matching public key.

---

## What's Installed

| Package | Version | Purpose |
|---------|---------|---------|
| Node.js | 20.x | Runtime for web apps |
| npm | (bundled) | Package management |
| Nginx | 1.22.x | Reverse proxy — routes paths to apps |
| pm2 | (global) | Process manager — keeps apps running, auto-restarts on boot |
| Vite | 8.x (global) | Build tool for frontend apps |
| build-essential | — | C compiler for native Node modules (e.g. better-sqlite3) |
| Git | — | Code deployment |
| avahi-daemon | — | mDNS — makes `anguspi.local` work on the network |

---

## Architecture

```
Browser request
    ↓
http://anguspi.local/movie-night/   →  Nginx (port 80)
http://anguspi.local/website/       →  Nginx (port 80)
http://anguspi.local/game/          →  Nginx (port 80)
    ↓
Nginx reverse proxy strips path prefix, forwards to:
    /movie-night/  →  127.0.0.1:3001
    /website/      →  127.0.0.1:3002  (future)
    /game/         →  127.0.0.1:3003  (future)
    ↓
pm2 keeps each app process alive
```

### Routing Convention: Paths (not subdomains)

Each app gets a **path prefix** on the same hostname:
- `http://anguspi.local/movie-night/`
- `http://anguspi.local/website/`
- `http://anguspi.local/game/`

This avoids needing custom DNS entries on every device. The trade-off is each app needs to know its base path (for client-side routing and asset loading).

### Port Allocation

| App | Port | Type | Status |
|-----|------|------|--------|
| Movie Night | 3001 | Node.js (pm2) | ✅ Running |
| Personal Website | N/A | Static (Nginx alias) | ✅ Running |
| Davin's Game | 3002 | TBD | 🔲 Planned |

---

## Nginx Configuration

**All apps share a single config file**: `/etc/nginx/sites-available/anguspi`, symlinked to `/etc/nginx/sites-enabled/anguspi`.

> **Important**: Do NOT create separate config files per app with the same `server_name`. Nginx will only use the first `server` block and silently ignore the others, causing 404s. All `location` blocks must be in one `server` block.

### Current config

File: `/etc/nginx/sites-available/anguspi`

```nginx
server {
    listen 80;
    server_name anguspi.local;

    # Movie Night (Node.js app)
    location /movie-night/ {
        proxy_pass http://127.0.0.1:3001/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }

    # Personal Website (static site)
    location /website/ {
        alias /home/gordon/gc-website/;
        index index.html;
    }
}
```

> **Notes**:
> - Trailing `/` on `proxy_pass` strips the path prefix — the app sees `/api/config` not `/movie-night/api/config`
> - Use `alias` (not `root`) for static sites so the URL path maps correctly to the filesystem
> - Nginx runs as `www-data` — needs `chmod 755` on every directory in the path to served files

### Adding a new app

1. Edit the shared config:
```bash
sudo nano /etc/nginx/sites-available/anguspi
```

2. Add a new `location` block inside the existing `server { }`:

For a **Node.js app**:
```nginx
    location /<app-path>/ {
        proxy_pass http://127.0.0.1:<port>/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
```

For a **static site**:
```nginx
    location /<app-path>/ {
        alias /home/gordon/<directory>/;
        index index.html;
    }
```

3. Test and restart:
```bash
sudo nginx -t && sudo systemctl restart nginx
```

---

## Deploying an App (General Steps)

### First time

1. Clone the repo:
```bash
cd ~ && git clone <repo-url> && cd <repo-name>
```

2. Install dependencies:
```bash
npm install
# For monorepos:
cd server && npm install && cd ..
cd client && npm install && cd ..
```

3. Copy config/data files from your Mac:
```bash
# From your Mac terminal:
scp <local-file> gordon@anguspi.local:~/path/on/pi/
```

4. Create `.env` with required environment variables.

5. If the app has a frontend build step, configure the **base path** in `vite.config.js`:
```js
export default defineConfig({
  base: '/<app-path>/',
  // ...
})
```

6. Build and start:
```bash
npm run build   # or: cd client && vite build && cd ..
pm2 start <entry-file-or-ecosystem.config.js> --name <app-name>
```

7. Save pm2 state:
```bash
pm2 save
```

### Updating an existing app

```bash
cd ~/<repo-name>
git pull
npm install && cd server && npm install && cd ../client && npm install && cd ..
npm run build   # rebuild frontend
pm2 restart <app-name>
```

### Base path considerations for frontend apps

When an app lives at `/<app-path>/` instead of `/`:
- **Vite**: Set `base: '/<app-path>/'` in `vite.config.js`
- **React Router**: Set `basename="/<app-path>"` on `<BrowserRouter>`
- **API calls**: Use a helper that prepends `import.meta.env.BASE_URL` to fetch paths
- **Static assets**: Vite handles this automatically when `base` is set

---

## File Locations on the Pi

```
~/what-to-watch-tonight/     # Movie Night app code
~/movie-night-data/           # Movie Night database (outside repo)
  movies.db
```

Convention: app code in `~/<repo-name>/`, data in `~/<app-name>-data/`.

---

## pm2 Commands

```bash
pm2 list                      # see all running apps
pm2 logs <app-name>           # tail logs
pm2 logs <app-name> --lines 50  # last 50 lines
pm2 restart <app-name>        # restart
pm2 stop <app-name>           # stop
pm2 delete <app-name>         # remove from pm2
pm2 save                      # persist current process list (survives reboot)
pm2 startup                   # generate boot script (run once)
```

---

## System Commands

```bash
# SSH
ssh gordon@anguspi.local

# Nginx
sudo nginx -t                    # test config
sudo systemctl restart nginx     # restart
sudo systemctl status nginx      # check status

# System
sudo reboot
sudo shutdown -h now
df -h                            # disk space
htop                             # CPU/RAM monitor (install: sudo apt install htop)
hostname -I                      # show IP address

# Updates
sudo apt update && sudo apt upgrade -y
```

---

## Troubleshooting

**`anguspi.local` doesn't resolve**
- Try a new Terminal window (macOS caches DNS failures)
- Restart avahi: `ssh gordon@10.0.0.76 "sudo systemctl restart avahi-daemon"`
- Fall back to IP: `10.0.0.76`

**502 Bad Gateway**
- App isn't running. Check: `pm2 list` and `pm2 logs <app-name>`

**Blank screen (app loads but nothing renders)**
- Hard refresh: Cmd+Shift+R (clears cached JS)
- Check browser console for errors
- Likely cause: API calls not using the base path prefix

**`MODULE_NOT_FOUND` in pm2 logs**
- A dependency is missing. `cd` into the app and run `npm install` (or `cd server && npm install`)

**`vite: not found`**
- Vite is installed globally. Check with `vite --version`. If missing: `sudo npm install -g vite`

**SSH key auth fails**
- Pi runs Trixie (Debian 13) which disables `ssh-rsa`. Use ed25519 keys.
- Generate: `ssh-keygen -t ed25519`
- Copy public key to Pi's `~/.ssh/authorized_keys`

---

## Initial Setup Reference

For setting up a new Pi from scratch, see [PI_FRESH_SETUP_GUIDE.md](./PI_FRESH_SETUP_GUIDE.md).

Key lessons from the first setup:
- **Starter kit SD cards come pre-loaded with the OS** — you can skip re-flashing if you have a TV + keyboard for initial setup, or add `ssh` and `userconf.txt` files to the boot partition
- **Raspberry Pi Imager requires Java** — if it won't install, download the OS image directly from raspberrypi.com and use `dd` or write config files to the boot partition manually
- **The apt version of Node.js on Trixie is v18** — install v20 via NodeSource for Vite compatibility
- **mDNS (`.local` hostnames) requires avahi-daemon** — usually pre-installed but may need a restart after hostname changes
- **SSH RSA keys are disabled on Trixie** — use ed25519 keys
