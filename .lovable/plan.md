
# Sessions：每一次对话都留下来

## 一、核心模型

**一次对话 = 一条 session**。首页输入框提交 → 新建 session → 跳详情页带 id。之后所有该会话内的操作都写回这条 session。历史列表就是所有 sessions 按时间倒序。

用户心智：**"这个 app 记得我说过的每一句话，随时可以回去看看那句话现在怎么样了。"**

## 二、页面布局

### 首页 `/` 三层结构（一屏内）

```text
┌─────────────────────────────────────┐
│  workspace header                    │
│                                      │
│  ActiveWishBanner（最近一条活跃的）  │  ← 已有
│                                      │
│  [ 输入框 ]                          │  ← 已有
│                                      │
│  ───── 你之前说过的 ─────            │  ← 新增
│  🎾 周末打网球         2 小时前 挂着 │
│  👋 跟 Mia 打招呼      昨天    未回复│
│  🏃 周中夜跑           3 天前  聊过  │
│  ...（最多 5 条）                    │
│  [ 查看全部 →   ]                    │
└─────────────────────────────────────┘
```

### 详情页复用现有

- `/side-by-side?session=xxx` — Do Something 类
- `/matchmaker?session=xxx` — Introduce 类

session id 只是决定"加载哪一份 state"。页面本身完全不用改。

### `/sessions` 全部记录页（可选，本版先做）

简单列表，同首页那 5 条的样式，但显示全部。空态提示"还没说过什么，去首页说一句吧"。

## 三、数据设计

```ts
// src/lib/sessions.ts (新增)
export type SessionAgent = "do_something" | "introduce";
export type SessionStatus = "waiting" | "matched" | "chatting" | "revoked";

export interface Session {
  id: string;
  agent: SessionAgent;
  createdAt: number;
  updatedAt: number;
  seed: string;              // 用户在首页说的原话，作为列表标题
  status: SessionStatus;     // 从 state 派生并缓存，用于列表展示
  state: unknown;            // SideState | MatchmakerState 的原样序列化
}

// API
listSessions(): Session[]                    // 按 updatedAt 倒序
getSession(id): Session | null
createSession(agent, seed, initialState): Session
updateSession(id, patch: { state, status? }): void
revokeSession(id): void                      // 标记 status = "revoked"，不删除
```

localStorage key: `kindred:sessions.v1`。

**关键**：现有的 `kindred:sidebyside.v5` 单例存储改为"当前活跃 session 的镜像"——每次 save 时同步写到对应 session。老数据首次加载迁移为一条 session。

## 四、路由与 state 加载

- `/side-by-side` 支持 search param `?session=<id>`：
  - 有 id：从 sessions 里加载 state
  - 无 id：兼容旧行为（走 `kindred:sidebyside.v5`），或者跳回首页
- 首页输入框提交时：
  1. `createSession("do_something" | "introduce", text, EMPTY_STATE)`
  2. 跳 `/side-by-side?session=<newId>`，页面挂载时执行 `submitPrompt(text)`（不再新建 session，只走匹配逻辑）

## 五、状态派生

`status` 从 SideState 派生一次，写到 session：

| SideState | Session.status |
|---|---|
| stage = "prompt" | "waiting" |
| stage = "published" & matchIntentId = null | "waiting" |
| stage = "published" & matchIntentId != null | "matched" |
| stage = "chat" | "chatting" |
| 用户主动 revokeAndReset | "revoked" |

列表上根据 status 显示 chip：挂着 / 排上了 / 聊过 / 已撤回。

## 六、实现清单

| 文件 | 改动 |
|---|---|
| `src/lib/sessions.ts` | **新增**。CRUD + 首次加载时把旧 `kindred:sidebyside.v5` 迁移为一条 session。 |
| `src/lib/agents/side-by-side.ts` | `save(state, sessionId?)`、`load(sessionId?)` 增加 sessionId 参数；无 id 时保持旧行为兼容。新增 `deriveStatus(state)`。 |
| `src/routes/index.tsx` | 输入框提交逻辑：先 createSession，再跳 `/side-by-side?session=<id>`。 |
| `src/routes/side-by-side.tsx` | 读 search param `session`；所有 setState 处调 `updateSession(id, { state, status })`。 |
| `src/components/session-list.tsx` | **新增**。首页下半，最多 5 条 + "查看全部"。 |
| `src/components/home.tsx` | 底部插入 `<SessionList limit={5} />`。 |
| `src/routes/sessions.tsx` | **新增**。全部列表页，复用 `<SessionList />` 不限量。 |
| `src/components/active-wish-banner.tsx` | 数据源从 `kindred:sidebyside.v5` 改为"最近一条非 revoked 的 session"。 |
| `src/locales/{en,zh-CN}/common.json` | 新增 ~8 keys：`sessions.title`、`sessions.status_waiting/matched/chatting/revoked`、`sessions.empty`、`sessions.view_all`、`sessions.time_ago_*`。 |

## 七、明确不做

- ❌ session 标题不可编辑（用 seed 原话）
- ❌ 不做筛选/搜索/tab 分类
- ❌ 不做删除（只有 revoke，保留历史）
- ❌ 不做详情快照页——点条目直接回到现有详情页
- ❌ 不做 Matchmaker 的 session 化（这一版只做 do_something；introduce/matchmaker 走通了再照搬同一套 sessions 层）

## 八、验收标准

1. 首页说一句话 → 跳详情页 → 后退回首页 → 下方列表里能看到这条，状态正确。
2. 再说一句新的话 → 又一条新 session，不覆盖上一条。
3. 点列表里的旧条目 → 回到当时的详情页，左栏 Agent 对话、右栏状态和当时一致，可继续操作。
4. 详情页里做任何操作（refine、chat、revoke）→ 返回首页看列表，updatedAt 和 status 已刷新。
5. 刷新浏览器后所有 session 仍在。
