#!/usr/bin/env bash
# Production deploy on the VPS. Intended to be run via GitHub Actions SSH
# or manually as the deploy user.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/aichat}"
BRANCH="${DEPLOY_BRANCH:-main}"

cd "$APP_DIR"

# Ensure bun is on PATH (installer default for ubuntu user)
export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
export PATH="$BUN_INSTALL/bin:$PATH"

if ! command -v bun >/dev/null 2>&1; then
  echo "error: bun not found on PATH" >&2
  exit 1
fi

echo ">>> pull origin/${BRANCH}"
git fetch --prune origin "$BRANCH"
git checkout "$BRANCH"
git reset --hard "origin/${BRANCH}"

echo ">>> install deps"
bun install --frozen-lockfile

echo ">>> build"
bun run build

echo ">>> db migrate"
bun run db:migrate

echo ">>> restart services"
sudo systemctl restart aichat-web aichat-ws

echo ">>> status"
sudo systemctl --no-pager --full status aichat-web aichat-ws || true

echo ">>> deploy ok @ $(git rev-parse --short HEAD)"
