#!/bin/bash
# Stop pm2 movie-night process if running, to free port 3001 for dev servers.
# Always exits 0 so it never blocks npm run dev.

PM2="$(command -v pm2 2>/dev/null || echo "$HOME/.npm-global/bin/pm2")"

if [ -x "$PM2" ] || [ -f "$PM2" ]; then
  if $PM2 describe movie-night > /dev/null 2>&1; then
    STATUS=$($PM2 jlist 2>/dev/null | node -e "
      const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
      const proc = data.find(p => p.name === 'movie-night');
      console.log(proc ? proc.pm2_env.status : 'not found');
    " 2>/dev/null)
    if [ "$STATUS" = "online" ]; then
      echo "⏹  Stopping pm2 movie-night to free port 3001..."
      $PM2 stop movie-night --silent
      echo "   Stopped. Use 'npm run deploy' to restart production later."
    fi
  fi
fi

exit 0
