#!/usr/bin/env bash
# Production deploy on the VPS. Intended to be run via GitHub Actions SSH
# or manually as the deploy user.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/aichat}"
BRANCH="${DEPLOY_BRANCH:-main}"
PUBLIC_HOST="${PUBLIC_HOST:-pelegant.info}"
DEPLOY_USER="${DEPLOY_USER:-${SUDO_USER:-$USER}}"

cd "$APP_DIR"

# Ensure bun is on PATH (installer default for ubuntu user)
export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
export PATH="$BUN_INSTALL/bin:$PATH"

if ! command -v bun >/dev/null 2>&1; then
  echo "error: bun not found on PATH (expected $BUN_INSTALL/bin/bun)" >&2
  exit 1
fi

if [[ ! -f /etc/systemd/system/aichat-web.service ]]; then
  echo "error: aichat-web.service missing — run: bash $APP_DIR/scripts/install-services.sh" >&2
  exit 1
fi

echo ">>> pull origin/${BRANCH}"
git fetch --prune origin "$BRANCH"
git checkout "$BRANCH"
git reset --hard "origin/${BRANCH}"

# Prefer wss + Secure cookies when Let's Encrypt cert exists for this host
if [[ -d "/etc/letsencrypt/live/${PUBLIC_HOST}" ]]; then
  if [[ -f .env ]]; then
    grep -qE '^VITE_WS_URL=' .env \
      && sed -i "s|^VITE_WS_URL=.*|VITE_WS_URL=wss://${PUBLIC_HOST}/ws|" .env \
      || echo "VITE_WS_URL=wss://${PUBLIC_HOST}/ws" >> .env
    grep -qE '^COOKIE_SECURE=' .env \
      && sed -i 's|^COOKIE_SECURE=.*|COOKIE_SECURE=1|' .env \
      || echo 'COOKIE_SECURE=1' >> .env
  fi
else
  # HTTP IP/domain deploys need non-Secure session cookies
  if [[ -f .env ]] && ! grep -qE '^COOKIE_SECURE=' .env; then
    echo "COOKIE_SECURE=0" >> .env
  fi
  if [[ -f .env ]]; then
    grep -qE '^VITE_WS_URL=' .env \
      && sed -i "s|^VITE_WS_URL=.*|VITE_WS_URL=ws://${PUBLIC_HOST}/ws|" .env \
      || echo "VITE_WS_URL=ws://${PUBLIC_HOST}/ws" >> .env
  fi
fi

echo ">>> install deps"
bun install --frozen-lockfile

echo ">>> build"
bun run build
[[ -f .output/server/index.mjs ]] || {
  echo "error: build missing .output/server/index.mjs" >&2
  exit 1
}

echo ">>> db migrate"
bun run db:migrate

echo ">>> refresh systemd units (if templates changed)"
if [[ -f deploy/aichat-web.service && -f deploy/aichat-ws.service ]]; then
  bun_bin="$BUN_INSTALL/bin/bun"
  node_bin="$(command -v node)"
  tmp="$(mktemp -d)"
  sed \
    -e "s|User=ubuntu|User=$DEPLOY_USER|g" \
    -e "s|Group=ubuntu|Group=$DEPLOY_USER|g" \
    -e "s|/home/ubuntu/.bun/bin|/home/$DEPLOY_USER/.bun/bin|g" \
    -e "s|/usr/bin/node|$node_bin|g" \
    -e "s|WorkingDirectory=/opt/aichat|WorkingDirectory=$APP_DIR|g" \
    -e "s|EnvironmentFile=/opt/aichat/.env|EnvironmentFile=$APP_DIR/.env|g" \
    deploy/aichat-web.service >"$tmp/aichat-web.service"
  sed \
    -e "s|User=ubuntu|User=$DEPLOY_USER|g" \
    -e "s|Group=ubuntu|Group=$DEPLOY_USER|g" \
    -e "s|/home/ubuntu/.bun/bin|/home/$DEPLOY_USER/.bun/bin|g" \
    -e "s|WorkingDirectory=/opt/aichat|WorkingDirectory=$APP_DIR|g" \
    -e "s|EnvironmentFile=/opt/aichat/.env|EnvironmentFile=$APP_DIR/.env|g" \
    deploy/aichat-ws.service >"$tmp/aichat-ws.service"
  sed -i "s|^ExecStart=.*|ExecStart=$bun_bin run ws|" "$tmp/aichat-ws.service"
  sudo cp "$tmp/aichat-web.service" /etc/systemd/system/aichat-web.service
  sudo cp "$tmp/aichat-ws.service" /etc/systemd/system/aichat-ws.service
  rm -rf "$tmp"
  sudo systemctl daemon-reload
fi

echo ">>> refresh nginx (if template present)"
if [[ -f deploy/nginx-aichat.conf ]]; then
  # live/ is often root-only; must use sudo test or we falsely overwrite and wipe SSL
  if sudo test -d "/etc/letsencrypt/live/${PUBLIC_HOST}"; then
    echo ">>> install HTTPS nginx template for ${PUBLIC_HOST}"
    sudo cp deploy/nginx-aichat.conf /etc/nginx/sites-available/aichat
    sudo ln -sf /etc/nginx/sites-available/aichat /etc/nginx/sites-enabled/aichat
    sudo nginx -t
    sudo systemctl reload nginx
  else
    echo ">>> install HTTP nginx template (no Let's Encrypt cert yet)"
    sudo tee /etc/nginx/sites-available/aichat >/dev/null <<EOF
server {
  listen 80;
  listen [::]:80;
  server_name ${PUBLIC_HOST} www.${PUBLIC_HOST};
  client_max_body_size 10m;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }
  location = /ws {
    proxy_pass http://127.0.0.1:3001/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host \$host;
    proxy_set_header Cookie \$http_cookie;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_read_timeout 86400;
  }
  location /ws/ {
    proxy_pass http://127.0.0.1:3001/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host \$host;
    proxy_set_header Cookie \$http_cookie;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_read_timeout 86400;
  }
}
EOF
    sudo ln -sf /etc/nginx/sites-available/aichat /etc/nginx/sites-enabled/aichat
    sudo nginx -t
    sudo systemctl reload nginx
  fi
fi

echo ">>> restart services"
sudo systemctl restart aichat-web aichat-ws

echo ">>> status"
sudo systemctl --no-pager --full status aichat-web aichat-ws || true

echo ">>> deploy ok @ $(git rev-parse --short HEAD)"
