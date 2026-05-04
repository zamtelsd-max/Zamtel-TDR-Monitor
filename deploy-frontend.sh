#!/bin/bash
# TDR Monitor — frontend deploy script
# Always wipes /var/www/tdr before copying to avoid stale hashed assets

set -e
cd /home/work/.openclaw/workspace/zamtel-tdr-monitor/frontend

VITE_USE_HASH=true \
VITE_BASE_URL=/Zamtel-TDR-Monitor/ \
VITE_API_URL=https://depcxnwq.gensparkclaw.com/tdr-api/api/v1 \
npx vite build

# Clean copy — wipe first to remove old hashed filenames
cp -r dist/. /home/work/tdr-dist/
sudo rm -rf /var/www/tdr/*
sudo cp -r dist/. /var/www/tdr/
sudo chown -R caddy:caddy /var/www/tdr
echo "✅ VM deployed"

# GitHub Pages
npx gh-pages -d dist
echo "✅ GitHub Pages deployed"
