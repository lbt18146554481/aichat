## 一句话说清楚

**首页每提交一次 → History 里就多一条，不论选的是 "look for someone"（介绍类）还是 "do something together"（一起做）。点 History 里任意一条 → 回到当时那段对话的现场。就这么简单。**

## 现在为什么不是这样

- 首页 `submit()` 里只有 `sidebyside` 分支建了 session；`matchmaker` 分支直接跳走，不落盘 → look for someone 的对话不进 History。
- `/matchmaker` 页面根本不认 session id，用自己独立的一份 localStorage → 就算建了 session 也回不去。
- 详情页允许不带 `?session=` 裸开，会走 legacy blob 分支，制造"孤儿状态" → 用户会看到多余或错位的记录。

## 改动（尽量少）

1. **首页 `submit()` 统一分支**  
   不管路由到哪个 Agent，都先 `createSession(agent, body, EMPTY_STATE)`，再带 `?session=<id>` 跳过去。两条分支只差 `agent` 字段 + 目标路径。

2. **`/matchmaker` 接上 session**  
   - 加 `validateSearch` 读 `session`。  
   - `load(sessionId)` / `save(state, sessionId)` 走 `sessions.ts`（照搬 side-by-side 的写法）。  
   - 没有 sessionId → `navigate({ to: "/" })`。

3. **`/side-by-side` 同样强制要 session**  
   没有 sessionId → 回首页。去掉 legacy blob 回退。

4. **`sessions.ts` 支持介绍类 session**  
   - `SessionAgent` 已经有 `"introduce"`，补一个 `deriveIntroduceStatus(state)`（先给 `chatting` / `waiting` / `revoked` 三态占位，够 History 显示状态胶囊即可）。  
   - `mostRecentActiveDoSomething` 保持不变（Banner 逻辑不动）。

5. **History 列表跳转**  
   `SessionList` 已经按 `s.agent` 分了跳转路径，这次让 `introduce` 分支也带 `search: { session: s.id }`，就通了。

6. **旧数据清理**  
   `sessions.ts` 里的迁移标志位 bump 到 `.v2`，重新跑一遍干净迁移，并把 legacy KEY（`sidebyside.v5` 与 matchmaker 的独立 KEY）在迁移成功后删掉。用户刷一次页面，之前堆积的"看着像重复"的记录就消失。

## 不做的事

- 不加搜索、过滤、分组、删除 session。  
- 不改 History 抽屉 UI、不改 ActiveWishBanner、不改详情页内部逻辑。  
- 不做"合并同类对话"这种复杂判断——**每次首页提交 = 一条新记录**，就是 ChatGPT 的 New Chat 心智。

## 变更文件

| 文件 | 变更 |
|---|---|
| `src/components/home.tsx` | `submit()` 两条分支都建 session、都带 `?session=` |
| `src/routes/matchmaker.tsx` | 加 `validateSearch`；按 sessionId load/save；无 id 回首页 |
| `src/routes/side-by-side.tsx` | 无 sessionId 回首页，去掉 legacy 回退 |
| `src/lib/agents/matchmaker.ts` | `load/save` 支持 sessionId；导出 `EMPTY` |
| `src/lib/agents/side-by-side.ts` | `load/save` 无 id 时 no-op |
| `src/lib/sessions.ts` | 迁移 flag → v2；`deriveIntroduceStatus`；成功后清 legacy KEY |
| `src/components/session-list.tsx` | `introduce` 分支跳转带 `search: { session }` |

## 验收标准

1. 首页写一句话，无论被路由到哪个 Agent，History 都多一条。  
2. 点 History 任意一条 → 回到那段对话现场（左侧消息 + 右侧画布状态）。  
3. 详情页回首页再写一次 → History 里是一条新的，不与旧的合并、也不复制旧的。  
4. 直接访问 `/side-by-side` 或 `/matchmaker`（不带 session）→ 弹回首页。
