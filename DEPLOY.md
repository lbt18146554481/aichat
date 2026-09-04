# 部署说明（自有云服务器 + IP）

目标机（当前）：

- 公有 IPv4：`13.251.22.192`（浏览器访问用这个）
- 私有 IPv4：`172.31.26.215`（AWS 内网，一般不用写进 Nginx / `VITE_WS_URL`）
- 代码目录：`/opt/aichat`
- 运行时：Ubuntu + bun + systemd + Nginx
- 自动部署分支：`main`

## 依赖

- Node.js 20+（跑 Nitro 产物 `.output/server/index.mjs`）
- bun（安装依赖 / 构建 / 跑 WS）
- Docker（跑 PostgreSQL）或本机 PostgreSQL
- Nginx
- GitHub Actions Secrets（见下文）

## 1. 服务器首次安装（推荐：一键脚本）

以 `ubuntu` 用户 SSH 登录后，**一行启动**（把仓库 URL 和 API Key 换成你的）：

```bash
export REPO_URL=https://github.com/lbt18146554481/aichat.git
export DEEPSEEK_API_KEY=sk-你的key
export PUBLIC_HOST=13.251.22.192
export BRANCH=main

# 公有仓库可以直接 curl 脚本；脚本内部会再用 REPO_URL clone
curl -fsSL https://raw.githubusercontent.com/lbt18146554481/aichat/main/scripts/bootstrap-server.sh | bash

# 私有仓 / raw 拉不到时：
#   git clone -b main "$REPO_URL" /opt/aichat
#   DEEPSEEK_API_KEY=sk-... PUBLIC_HOST=13.251.22.192 bash /opt/aichat/scripts/bootstrap-server.sh
```

脚本会自动完成：

1. 安装 git / nginx / docker / Node 20 / bun  
2. clone 或 `git pull` 到 `/opt/aichat`  
3. 写 `.env`（自动生成 `SESSION_SECRET`）  
4. `docker compose up` 起 Postgres  
5. `bun install` → 首次 `db:setup` → `bun run build`  
6. 安装 systemd（`aichat-web` / `aichat-ws`）+ Nginx  
7. 配置免密 `systemctl restart`（给后续 GitHub Actions 用）

可选环境变量：`APP_DIR`、`SKIP_APT=1`、`SKIP_SEED=1`、`FORCE_SEED=1`。

> 注意：一键脚本本身也在仓库里，**请先把含 `scripts/bootstrap-server.sh` 的提交 push 到 `main`**，再在服务器上 curl。

安全组至少放行：**22**、**80**。浏览器打开：`http://13.251.22.192/`  
种子邀请码：`KINDRED2026` / `WELCOME` / `FRIENDS`

### 手动安装（不推荐，逐步对照）

见 git 历史或按脚本步骤拆开执行；日常维护用 `bash /opt/aichat/scripts/deploy.sh`。

## 2. GitHub 自动部署（push main → 拉代码 → 构建 → 重启）

### 2.1 部署用 SSH 密钥

在服务器上（或本机生成后把公钥放进服务器 `~/.ssh/authorized_keys`）：

```bash
ssh-keygen -t ed25519 -f ~/.ssh/github_deploy -N "" -C "github-deploy"
cat ~/.ssh/github_deploy.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

把 **私钥** `~/.ssh/github_deploy` 全文拷到 GitHub Secrets（仓库 → Settings → Secrets and variables → Actions）：

| Secret | 值 |
|--------|-----|
| `DEPLOY_HOST` | `13.251.22.192` |
| `DEPLOY_USER` | `ubuntu` |
| `DEPLOY_KEY` | 私钥全文 |
| `DEPLOY_PORT` | `22`（可选；非 22 才需要） |

### 2.2 工作流

推送到 `main`（或手动跑 workflow）会执行 `.github/workflows/deploy.yml`：SSH 到机器后跑 `scripts/deploy.sh`：

1. `git fetch` + `reset --hard origin/main`
2. `bun install --frozen-lockfile`
3. `bun run build`
4. `bun run db:migrate`（只迁移，不重复 seed）
5. `systemctl restart aichat-web aichat-ws`

也可在服务器上手动：

```bash
bash /opt/aichat/scripts/deploy.sh
```

## 3. 本地开发

需要 **两个进程**：

```bash
bun install
bun run ws      # 终端 1：WebSocket 实时推送（默认 :3001）
bun run dev     # 终端 2：Web 应用
```

打开提示的本地地址。用邀请码 + 邮箱密码注册。

聊天会优先走 WebSocket；WS 挂掉时自动回退轮询。

## 4. 手动生产构建（同机）

```bash
bun run build
node .output/server/index.mjs
bun run ws
```

若用 Nginx 反代 WS 到同域 `/ws/`，前端构建前 `.env` 需有：

```bash
VITE_WS_URL=ws://13.251.22.192/ws
```

（`VITE_*` 在 **build 时** 打进前端；改完后要重新 `bun run build` 再重启。）

## 5. 安全提醒

- 若 API Key 曾出现在聊天/截图里，请立刻在 DeepSeek 控制台轮换。
- `SESSION_SECRET` 生产环境必须换成长随机串。
- `.env` 已在 `.gitignore` 中；密钥只放服务器与 GitHub Secrets。
- 纯 HTTP + IP 部署时，登录 cookie 不要开 `Secure`（否则写不进浏览器）。
- 私有 IP `172.31.26.215` 仅 VPC 内可达，不要当成对外访问地址。

## 6. 功能对照

| 能力 | 实现 |
|------|------|
| 登录 | 邮箱 + 密码 + 邀请码，session cookie |
| 资料/会话/收藏 | PostgreSQL |
| 匹配对象 | 种子假人（12 人） |
| Agent 文案 | DeepSeek（失败则回落模板） |
| 私聊 | 假人 LLM 回复 + **WebSocket 实时推送**（断线回退轮询） |
