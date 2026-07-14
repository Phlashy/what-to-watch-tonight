# WTWT — Remote Access (Tailscale)

Quick links and commands for using and deploying the Movie Night app from anywhere.

## Links

- App (home Wi-Fi): http://anguspi.local/movie-night/
- App (anywhere, HTTPS): https://anguspi.tail485122.ts.net:8443/movie-night/

## Deploy from anywhere

    ssh gordon@anguspi.tail485122.ts.net "cd ~/what-to-watch-tonight && git pull && pm2 restart movie-night"

(At home you can still use anguspi.local instead of the Tailscale name.)

## Requirements

- The device must be signed into Tailscale (account: Phlashy@). On a phone, install the Tailscale app.
- NordVPN must be OFF / paused while you use Tailscale — two VPNs can't both own the connection, and NordVPN on macOS has no split-tunnel to carve out an exception. Nord stays fine for streaming/geo-unblocking, just not at the same time as Tailscale.

## Pause-on-demand routine (when NordVPN is on)

Mac:

1. Click the NordVPN icon in the menu bar (top-right).
2. Choose Pause (pick a duration — it auto-resumes after) or Disconnect.
3. Use Tailscale / the app, then resume Nord when done.

iPhone: turn NordVPN off in its app, then open the Tailscale app and toggle it on.

## Pi reference

- Tailnet: tail485122.ts.net
- Pi name: anguspi.tail485122.ts.net (tailnet IP 100.107.76.32)
- Private HTTPS set up with: tailscale serve --bg --https=8443 http://127.0.0.1:80
- To remove it: tailscale serve --https=8443 off
- The public Funnel on :443 is shared by path: `/` is another project's app and
  `/movie-night` is the **second WTWT instance** (a different family's copy — see
  the MONTREAL-INSTANCE runbook). Gordon's own instance is the private `:8443`
  above; don't confuse the two. Touch the `/movie-night` funnel mount only via
  the instance runbook (`--set-path=/movie-night`), never `--https=443 off`
  (that would also drop the other project).
