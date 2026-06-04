#!/bin/bash
# TDR Monitor backend startup script
cd /home/work/.openclaw/workspace/zamtel-tdr-monitor/backend

# Generate Prisma client (silent, never fail)
npx prisma generate --silent 2>/dev/null || true

# Compile only if dist/index.js is missing or source is newer
NEEDS_COMPILE=false
if [ ! -f dist/index.js ]; then
  NEEDS_COMPILE=true
elif find src -name "*.ts" -newer dist/index.js 2>/dev/null | grep -q .; then
  NEEDS_COMPILE=true
fi

if [ "$NEEDS_COMPILE" = "true" ]; then
  echo "[tdr] Compiling TypeScript..."
  npx tsc -p tsconfig.railway.json 2>/dev/null || npx tsc --skipLibCheck --noEmitOnError false 2>/dev/null || true
fi

# NOTE: The old sed "plural model" patch was REMOVED (2026-06-04).
# The Prisma client uses SINGULAR camelCase models (prisma.user, prisma.agent, etc.).
# The old patch converted these to non-existent plurals (prisma.users) and broke endpoints (e.g. /flags).

echo "[tdr] Starting on port 8082..."
exec node dist/index.js
