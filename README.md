# AI Meet Chat

我想构建一个新的交友平台，但是以AI对话框的方式开始作为交互的开始。

当前版本已接入 **PostgreSQL + 邮箱密码登录 + DeepSeek**，详见 [DEPLOY.md](./DEPLOY.md)。

## Quick start

```sh
docker compose up -d
cp .env.example .env   # 填入 DATABASE_URL / SESSION_SECRET / DEEPSEEK_API_KEY
bun install            # 或 npm install
bun run db:setup
bun run dev
```

注册需邀请码（种子码：`KINDRED2026` / `WELCOME` / `FRIENDS`），登录用邮箱+密码。

本地开发请开两个终端：`bun run ws`（实时聊天）+ `bun run dev`。

This project was built with [Lovable](https://lovable.dev).
