#!/bin/bash
set -e

# Resolve pm2 binary
PM2="$(command -v pm2 2>/dev/null || echo "$HOME/.npm-global/bin/pm2")"
if [ ! -x "$PM2" ] && [ ! -f "$PM2" ]; then
  echo "Error: pm2 not found. Install with: npm install -g pm2"
  exit 1
fi

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

echo ""
echo "🎬 Movie Night Deploy"
echo ""

# Step 1: Build client
echo "[1/3] Building client..."
npm run build --silent
echo "   ✓ Built client/dist/"

# Verify build output
if [ ! -f "client/dist/index.html" ]; then
  echo "   ✗ client/dist/index.html not found — build may have failed."
  exit 1
fi

# Step 2: Start or restart pm2
echo "[2/3] Starting production server..."
if $PM2 describe movie-night > /dev/null 2>&1; then
  $PM2 restart ecosystem.config.js --silent
  echo "   ✓ Restarted pm2 process"
else
  $PM2 start ecosystem.config.js --silent
  echo "   ✓ Started pm2 process"
fi

# Step 3: Show status
echo "[3/3] Status:"
$PM2 list
echo ""
echo "✓ Deploy complete → http://localhost:3001/"
echo ""
