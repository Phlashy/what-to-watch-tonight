# WTWT — Remote Access (Tailscale)

How to reach and deploy the Movie Night app from anywhere.

## Links

- App (home Wi-Fi): http://anguspi.local/movie-night/
- **App (anywhere, public): https://anguspi.tail485122.ts.net:8443/movie-night/**
  — password-protected (shared `APP_PASSWORD`). **No Tailscale needed on the
  device.** Enter the password once per device and it's remembered.

## Using the app (family)

Just open the public URL above in any browser and enter the shared password.
On a phone, "Add to Home Screen" makes it feel like a native app. Tailscale/VPN
state on the phone no longer matters — the app is served over the public
internet (via Tailscale **Funnel** on port 8443), gated by the password.

> Flipped from private to public on 2026-08-03 (was tailnet-only `serve`).
> Before, every device needed Tailscale connected; now none do.

## Deploy from anywhere (Gordon only)

Deploys still go over SSH on the tailnet, so **the Mac** still needs Tailscale:

    ssh gordon@anguspi.tail485122.ts.net "cd ~/what-to-watch-tonight && git pull && pm2 restart movie-night"

(At home you can still use anguspi.local instead of the Tailscale name.)

- The Mac must be signed into Tailscale (account: Phlashy@).
- NordVPN must be OFF / paused while deploying — two VPNs can't both own the
  connection, and NordVPN on macOS has no split-tunnel. Nord is fine for
  streaming, just not at the same time as Tailscale. (This only affects
  *deploying*; the family using the app is unaffected by any VPN.)

## How the public exposure is wired

Port 443's Funnel was already taken (`/` = Legs & Sleep Log, `/movie-night` =
the **Montreal** WTWT instance — a different family's copy, see
`docs/MONTREAL-INSTANCE.md`). So this instance keeps its own port, **8443**,
flipped from private `serve` to public `funnel`:

    public :8443  →  nginx 127.0.0.1:8093 (movie-night only)  →  app :3001

- **Isolated nginx block** (`/etc/nginx/sites-available/anguspi`, marker
  `# --- Gordon public funnel block`): `listen 127.0.0.1:8093;` with
  `location /movie-night/ → proxy_pass http://127.0.0.1:3001/;` (trailing slash
  strips the prefix). Isolated on purpose — going public exposes ONLY
  `/movie-night/`, not the rest of nginx.
- **Funnel command that made it public:**
  `sudo tailscale funnel --bg --https=8443 http://127.0.0.1:8093`
- **Password gate is mandatory** while public: `APP_PASSWORD` in
  `~/what-to-watch-tonight/.env`. The server rejects every `/api` request
  without it (401); the client shows a one-time password screen. The static
  app shell is public, but all data behind it is gated.
- **Monitoring:** `~/scripts/health-check.sh` (cron, every 5 min) probes
  `http://127.0.0.1:8093/movie-night/health` and checks the `:8443` funnel
  mount still exists → alerts to ntfy if the public route drops.

### To revert to private (tailnet-only)

    sudo tailscale funnel --https=8443 off
    sudo tailscale serve --bg --https=8443 http://127.0.0.1:80

(Optional: remove `APP_PASSWORD` from `.env` + `pm2 restart movie-night` to drop
the gate once it's private again.)

## Pi reference

- Tailnet: tail485122.ts.net
- Pi name: anguspi.tail485122.ts.net (tailnet IP 100.107.76.32)
- **Don't** run `tailscale funnel --https=443 off` — 443 is shared by the Legs &
  Sleep Log and the Montreal instance; touch the Montreal mount only via its
  runbook (`--set-path=/movie-night`). This instance lives on `:8443`, separate.
