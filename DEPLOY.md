# 部署说明（自有云服务器 + IP）

## 依赖

- Node.js 20+
- Docker（跑 PostgreSQL）或本机 PostgreSQL
- bun 或 npm

## 1. 数据库

```bash
docker compose up -d
# Postgres 映射在 5433（避免和本机 5432 冲突）
```

复制环境变量：

```bash
cp .env.example .env
# 编辑 .env：DATABASE_URL / SESSION_SECRET / DEEPSEEK_API_KEY
```

初始化：

```bash
bun run db:setup
# 或: npx tsx scripts/db-migrate.ts && npx tsx scripts/db-seed.ts
```

种子邀请码：`KINDRED2026` / `WELCOME` / `FRIENDS`

## 2. 本地开发

需要 **两个进程**：

```bash
bun install
bun run ws      # 终端 1：WebSocket 实时推送（默认 :3001）
bun run dev     # 终端 2：Web 应用
```

打开提示的本地地址。用邀请码 + 邮箱密码注册。

聊天会优先走 WebSocket；WS 挂掉时自动回退轮询。

## 3. 生产构建（同机 IP 访问）

```bash
bun run build
# 用 TanStack Start / Nitro 产出启动（具体入口随 @lovable.dev/vite-tanstack-config）：
node .output/server/index.mjs
# 同时启动 WS：
bun run ws
```

Nginx 示例（把 `YOUR_IP` / 端口换成你的）：

```nginx
server {
  listen 80;
  server_name YOUR_IP;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  # WebSocket 实时聊天
  location /ws/ {
    proxy_pass http://127.0.0.1:3001/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header Cookie $http_cookie;
  }
}
```

若用 Nginx 反代 WS 到同域 `/ws/`，前端 `.env` 设：

```bash
VITE_WS_URL=ws://YOUR_IP/ws
```

（直连端口时可省略，默认 `ws://同一主机:3001`。）

确保防火墙放行 80（以及若直连则放行 3001），且 `.env` 里 `DEEPSEEK_API_KEY` **只放在服务器本地**，不要提交进 Git。

## 4. 安全提醒

- 若 API Key 曾出现在聊天/截图里，请立刻在 DeepSeek 控制台轮换。
- `SESSION_SECRET` 生产环境必须换成长随机串。
- `.env` 已在 `.gitignore` 中。
- 纯 HTTP + IP 部署时，登录 cookie 不要开 `Secure`（否则写不进浏览器）。

## 5. 功能对照

| 能力 | 实现 |
|------|------|
| 登录 | 邮箱 + 密码 + 邀请码，session cookie |
| 资料/会话/收藏 | PostgreSQL |
| 匹配对象 | 种子假人（12 人） |
| Agent 文案 | DeepSeek（失败则回落模板） |
| 私聊 | 假人 LLM 回复 + **WebSocket 实时推送**（断线回退轮询） |
