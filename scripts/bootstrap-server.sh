#!/usr/bin/env bash
# One-shot bootstrap for Ubuntu VPS: install toolchain, pull code, build, start.
#
# Usage (on the server as ubuntu / sudoer):
#   export DEEPSEEK_API_KEY=sk-...
#   export REPO_URL=https://github.com/YOUR_ORG/YOUR_REPO.git   # required on empty machine
#   curl -fsSL https://raw.githubusercontent.com/YOUR_ORG/YOUR_REPO/main/scripts/bootstrap-server.sh | bash
#
# Private repo (clone first, then):
#   DEEPSEEK_API_KEY=sk-... bash /opt/aichat/scripts/bootstrap-server.sh

#
# Optional env:
#   APP_DIR=/opt/aichat
#   BRANCH=main
#   PUBLIC_HOST=13.251.22.192
#   SKIP_APT=1          # skip apt / node / bun install
#   SKIP_SEED=1         # only migrate, never seed
#   FORCE_SEED=1        # always run db:setup
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/aichat}"
BRANCH="${BRANCH:-main}"
PUBLIC_HOST="${PUBLIC_HOST:-13.251.22.192}"
REPO_URL="${REPO_URL:-}"
DEPLOY_USER="${DEPLOY_USER:-${SUDO_USER:-$USER}}"

if [[ "$(id -u)" -eq 0 ]]; then
  echo "error: please run as a normal sudo user (e.g. ubuntu), not root" >&2
  exit 1
fi

if ! command -v sudo >/dev/null 2>&1; then
  echo "error: sudo is required" >&2
  exit 1
fi

log() { printf '\n\033[1;32m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mwarn:\033[0m %s\n' "$*" >&2; }
die() { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

ensure_deepseek_key() {
  if [[ -n "${DEEPSEEK_API_KEY:-}" ]]; then
    return 0
  fi
  if [[ -f "$APP_DIR/.env" ]] && grep -qE '^DEEPSEEK_API_KEY=.+' "$APP_DIR/.env"; then
    # shellcheck disable=SC1090
    set -a
    # shellcheck disable=SC1091
    source "$APP_DIR/.env"
    set +a
  fi
  if [[ -n "${DEEPSEEK_API_KEY:-}" ]]; then
    return 0
  fi
  if [[ -t 0 ]]; then
    read -r -p "Enter DEEPSEEK_API_KEY: " DEEPSEEK_API_KEY
  fi
  [[ -n "${DEEPSEEK_API_KEY:-}" ]] || die "DEEPSEEK_API_KEY is required (export it before running)"
}

ensure_docker() {
  if command -v docker >/dev/null 2>&1; then
    log "docker already present: $(docker --version 2>/dev/null || true)"
    sudo systemctl enable --now docker 2>/dev/null || true
  else
    # Prefer Ubuntu package only when no Docker CE / containerd.io is installed.
    # Official Docker CE uses containerd.io, which conflicts with apt package "containerd"
    # pulled in by docker.io — so never force docker.io onto a CE host.
    log "install docker.io (Ubuntu package)"
    if ! sudo DEBIAN_FRONTEND=noninteractive apt-get install -y docker.io; then
      die "docker not found and docker.io install failed (containerd conflict?). Install Docker CE manually, then re-run."
    fi
    sudo systemctl enable --now docker
  fi

  if ! groups "$DEPLOY_USER" | grep -qw docker; then
    sudo usermod -aG docker "$DEPLOY_USER"
    warn "added $DEPLOY_USER to docker group (new shells pick this up automatically)"
  fi
}

install_base_packages() {
  if [[ "${SKIP_APT:-}" == "1" ]]; then
    log "skip apt / node / bun (SKIP_APT=1)"
    ensure_docker
    return 0
  fi

  log "apt packages"
  sudo apt-get update -y
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
    git curl ca-certificates nginx openssl

  ensure_docker

  if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | sed 's/^v//' | cut -d. -f1)" -lt 20 ]]; then
    log "install Node.js 20"
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
  else
    log "Node.js already ok: $(node -v)"
  fi

  export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
  export PATH="$BUN_INSTALL/bin:$PATH"
  if ! command -v bun >/dev/null 2>&1; then
    log "install bun"
    curl -fsSL https://bun.sh/install | bash
    export PATH="$BUN_INSTALL/bin:$PATH"
  else
    log "bun already ok: $(bun -v)"
  fi

  command -v node >/dev/null || die "node missing after install"
  command -v bun >/dev/null || die "bun missing after install"
  command -v docker >/dev/null || die "docker missing after install"
}

sync_repo() {
  log "sync repo → $APP_DIR ($BRANCH)"
  sudo mkdir -p "$APP_DIR"
  sudo chown "$DEPLOY_USER:$DEPLOY_USER" "$APP_DIR"

  if [[ -d "$APP_DIR/.git" ]]; then
    git -C "$APP_DIR" fetch --prune origin "$BRANCH"
    git -C "$APP_DIR" checkout "$BRANCH"
    git -C "$APP_DIR" reset --hard "origin/$BRANCH"
  else
    if [[ -z "$REPO_URL" ]]; then
      # Script may already live inside a checkout copied elsewhere
      if [[ -f "$(pwd)/package.json" && -f "$(pwd)/scripts/bootstrap-server.sh" ]]; then
        warn "APP_DIR empty of git; copying current tree into $APP_DIR"
        rsync -a --delete \
          --exclude .git --exclude node_modules --exclude .output --exclude dist \
          "$(pwd)/" "$APP_DIR/"
        if [[ -d "$(pwd)/.git" ]]; then
          git clone --branch "$BRANCH" "$(pwd)" "$APP_DIR-tmp" 2>/dev/null || true
        fi
      fi
      if [[ ! -f "$APP_DIR/package.json" ]]; then
        die "REPO_URL is required on a blank machine, e.g. export REPO_URL=https://github.com/org/repo.git"
      fi
    else
      if [[ -n "$(ls -A "$APP_DIR" 2>/dev/null || true)" ]]; then
        die "$APP_DIR is not empty and is not a git repo; clean it or set another APP_DIR"
      fi
      git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
    fi
  fi

  [[ -f "$APP_DIR/package.json" ]] || die "package.json missing in $APP_DIR"
  [[ -f "$APP_DIR/scripts/deploy.sh" ]] || warn "scripts/deploy.sh missing — push deploy files to $BRANCH first"
}

write_env() {
  local env_file="$APP_DIR/.env"
  local secret
  secret="$(openssl rand -hex 32)"

  if [[ -f "$env_file" ]]; then
    log "keep existing .env (update key fields if empty)"
    grep -qE '^NODE_ENV=' "$env_file" || echo "NODE_ENV=production" >>"$env_file"
    if ! grep -qE '^SESSION_SECRET=.+' "$env_file"; then
      echo "SESSION_SECRET=$secret" >>"$env_file"
    fi
    if ! grep -qE '^DEEPSEEK_API_KEY=.+' "$env_file"; then
      echo "DEEPSEEK_API_KEY=$DEEPSEEK_API_KEY" >>"$env_file"
    elif [[ -n "${DEEPSEEK_API_KEY:-}" ]]; then
      # refresh from env if provided this run
      sed -i "s|^DEEPSEEK_API_KEY=.*|DEEPSEEK_API_KEY=$DEEPSEEK_API_KEY|" "$env_file"
    fi
    if ! grep -qE '^VITE_WS_URL=' "$env_file"; then
      echo "VITE_WS_URL=ws://${PUBLIC_HOST}/ws" >>"$env_file"
    else
      sed -i "s|^VITE_WS_URL=.*|VITE_WS_URL=ws://${PUBLIC_HOST}/ws|" "$env_file"
    fi
    sed -i 's/^NODE_ENV=.*/NODE_ENV=production/' "$env_file" || true
    return 0
  fi

  log "create .env"
  cat >"$env_file" <<EOF
DATABASE_URL=postgresql://maitri:maitri@127.0.0.1:5433/maitri
SESSION_SECRET=$secret
DEEPSEEK_API_KEY=$DEEPSEEK_API_KEY
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-pro
NODE_ENV=production
WS_PORT=3001
VITE_WS_URL=ws://${PUBLIC_HOST}/ws
EOF
  chmod 600 "$env_file"
}

start_postgres() {
  log "postgres via docker compose"
  cd "$APP_DIR"
  # Use sudo so we don't depend on re-login for docker group
  if docker compose version >/dev/null 2>&1; then
    sudo docker compose up -d
  elif command -v docker-compose >/dev/null 2>&1; then
    sudo docker-compose up -d
  else
    # Ubuntu docker.io sometimes ships compose plugin separately
    sudo apt-get install -y docker-compose-v2 || sudo apt-get install -y docker-compose
    if docker compose version >/dev/null 2>&1; then
      sudo docker compose up -d
    else
      sudo docker-compose up -d
    fi
  fi

  log "wait for postgres on :5433"
  for _ in $(seq 1 60); do
    if (echo >/dev/tcp/127.0.0.1/5433) >/dev/null 2>&1; then
      sleep 2
      return 0
    fi
    sleep 1
  done
  die "postgres did not become ready on 127.0.0.1:5433"
}

install_app() {
  export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
  export PATH="$BUN_INSTALL/bin:$PATH"
  cd "$APP_DIR"

  log "bun install"
  bun install --frozen-lockfile || bun install

  local marker="$APP_DIR/.bootstrap-seeded"
  if [[ "${FORCE_SEED:-}" == "1" ]] || { [[ ! -f "$marker" ]] && [[ "${SKIP_SEED:-}" != "1" ]]; }; then
    log "db:setup (migrate + seed)"
    bun run db:setup
    touch "$marker"
  else
    log "db:migrate"
    bun run db:migrate
  fi

  log "build"
  bun run build
  [[ -f "$APP_DIR/.output/server/index.mjs" ]] || die "build missing .output/server/index.mjs"
}

install_systemd_and_nginx() {
  export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
  local bun_bin="$BUN_INSTALL/bin/bun"
  local node_bin
  node_bin="$(command -v node)"
  [[ -x "$bun_bin" ]] || die "bun not executable at $bun_bin"
  [[ -x "$node_bin" ]] || die "node not found"

  log "systemd units (user=$DEPLOY_USER)"
  local tmp
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

  # Ensure ExecStart uses this machine's bun
  if ! grep -q "$bun_bin" "$tmp/aichat-ws.service"; then
    sed -i "s|^ExecStart=.*|ExecStart=$bun_bin run ws|" "$tmp/aichat-ws.service"
  fi

  sudo cp "$tmp/aichat-web.service" /etc/systemd/system/aichat-web.service
  sudo cp "$tmp/aichat-ws.service" /etc/systemd/system/aichat-ws.service
  rm -rf "$tmp"

  sudo systemctl daemon-reload
  sudo systemctl enable aichat-web aichat-ws
  sudo systemctl restart aichat-web aichat-ws

  log "nginx"
  if [[ -f "$APP_DIR/deploy/nginx-aichat.conf" ]]; then
    sed "s/server_name .*/server_name $PUBLIC_HOST;/" \
      "$APP_DIR/deploy/nginx-aichat.conf" | sudo tee /etc/nginx/sites-available/aichat >/dev/null
  else
    die "deploy/nginx-aichat.conf missing"
  fi
  sudo ln -sf /etc/nginx/sites-available/aichat /etc/nginx/sites-enabled/aichat
  sudo rm -f /etc/nginx/sites-enabled/default
  sudo nginx -t
  sudo systemctl enable nginx
  sudo systemctl reload nginx

  log "passwordless systemctl for deploy"
  sudo tee /etc/sudoers.d/aichat-deploy >/dev/null <<EOF
$DEPLOY_USER ALL=(ALL) NOPASSWD: /bin/systemctl restart aichat-web, /bin/systemctl restart aichat-ws, /bin/systemctl status aichat-web, /bin/systemctl status aichat-ws, /bin/systemctl --no-pager --full status aichat-web aichat-ws
EOF
  sudo chmod 440 /etc/sudoers.d/aichat-deploy

  chmod +x "$APP_DIR/scripts/deploy.sh" 2>/dev/null || true
}

print_summary() {
  log "done"
  echo "App dir:     $APP_DIR"
  echo "Branch:      $BRANCH"
  echo "Public URL:  http://$PUBLIC_HOST/"
  echo "Invite codes: KINDRED2026 / WELCOME / FRIENDS"
  echo
  sudo systemctl --no-pager --full status aichat-web aichat-ws || true
  echo
  echo "Open security group ports 22 and 80 if the page does not load."
  echo "Later updates: push to $BRANCH, or: bash $APP_DIR/scripts/deploy.sh"
}

main() {
  log "bootstrap AI Meet Chat on Ubuntu"
  ensure_deepseek_key
  install_base_packages
  sync_repo
  write_env
  start_postgres
  install_app
  install_systemd_and_nginx
  print_summary
}

main "$@"
