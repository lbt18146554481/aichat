#!/usr/bin/env bash
# Install/refresh systemd + Nginx for an already-cloned /opt/aichat tree.
# Usage:
#   bash /opt/aichat/scripts/install-services.sh
#   APP_DIR=/opt/aichat PUBLIC_HOST=13.251.22.192 bash scripts/install-services.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/aichat}"
PUBLIC_HOST="${PUBLIC_HOST:-13.251.22.192}"
DEPLOY_USER="${DEPLOY_USER:-${SUDO_USER:-$USER}}"

log() { printf '\n\033[1;32m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

[[ "$(id -u)" -eq 0 ]] && die "run as ubuntu (sudoer), not root"
[[ -d "$APP_DIR" ]] || die "APP_DIR missing: $APP_DIR"
[[ -f "$APP_DIR/deploy/aichat-web.service" ]] || die "deploy units missing — git pull first"
[[ -f "$APP_DIR/package.json" ]] || die "not an aichat checkout: $APP_DIR"

export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
export PATH="$BUN_INSTALL/bin:$PATH"
bun_bin="$BUN_INSTALL/bin/bun"
node_bin="$(command -v node || true)"
[[ -x "$bun_bin" ]] || die "bun not found at $bun_bin"
[[ -n "$node_bin" && -x "$node_bin" ]] || die "node not found"

cd "$APP_DIR"

if [[ ! -f .output/server/index.mjs ]]; then
  log "no build output — building"
  bun install --frozen-lockfile || bun install
  bun run build
fi
[[ -f .output/server/index.mjs ]] || die "build missing .output/server/index.mjs"

if [[ ! -f .env ]]; then
  die ".env missing — create $APP_DIR/.env first (copy .env.example)"
fi

log "install systemd units (user=$DEPLOY_USER)"
tmp="$(mktemp -d)"
sed \
  -e "s|User=ubuntu|User=$DEPLOY_USER|g" \
  -e "s|Group=ubuntu|Group=$DEPLOY_USER|g" \
  -e "s|/home/ubuntu/.bun/bin|/home/$DEPLOY_USER/.bun/bin|g" \
  -e "s|/usr/bin/node|$node_bin|g" \
  -e "s|WorkingDirectory=/opt/aichat|WorkingDirectory=$APP_DIR|g" \
  -e "s|EnvironmentFile=/opt/aichat/.env|EnvironmentFile=$APP_DIR/.env|g" \
  "$APP_DIR/deploy/aichat-web.service" >"$tmp/aichat-web.service"
sed \
  -e "s|User=ubuntu|User=$DEPLOY_USER|g" \
  -e "s|Group=ubuntu|Group=$DEPLOY_USER|g" \
  -e "s|/home/ubuntu/.bun/bin|/home/$DEPLOY_USER/.bun/bin|g" \
  -e "s|WorkingDirectory=/opt/aichat|WorkingDirectory=$APP_DIR|g" \
  -e "s|EnvironmentFile=/opt/aichat/.env|EnvironmentFile=$APP_DIR/.env|g" \
  "$APP_DIR/deploy/aichat-ws.service" >"$tmp/aichat-ws.service"
sed -i "s|^ExecStart=.*|ExecStart=$bun_bin run ws|" "$tmp/aichat-ws.service"

sudo cp "$tmp/aichat-web.service" /etc/systemd/system/aichat-web.service
sudo cp "$tmp/aichat-ws.service" /etc/systemd/system/aichat-ws.service
rm -rf "$tmp"

sudo systemctl daemon-reload
sudo systemctl enable aichat-web aichat-ws
sudo systemctl restart aichat-web aichat-ws

log "nginx"
sed "s/server_name .*/server_name $PUBLIC_HOST;/" \
  "$APP_DIR/deploy/nginx-aichat.conf" | sudo tee /etc/nginx/sites-available/aichat >/dev/null
sudo ln -sf /etc/nginx/sites-available/aichat /etc/nginx/sites-enabled/aichat
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl reload nginx

log "passwordless sudo for deploy.sh (systemctl + nginx)"
sudo tee /etc/sudoers.d/aichat-deploy >/dev/null <<EOF
$DEPLOY_USER ALL=(ALL) NOPASSWD: /bin/systemctl, /usr/sbin/nginx, /bin/cp, /usr/bin/tee, /bin/ln, /bin/mkdir, /bin/rm
EOF
sudo chmod 440 /etc/sudoers.d/aichat-deploy

log "status"
sudo systemctl --no-pager --full status aichat-web aichat-ws || true
echo
echo "Open: http://$PUBLIC_HOST/"
echo "Later updates: bash $APP_DIR/scripts/deploy.sh"
