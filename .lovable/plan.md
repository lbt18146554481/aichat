## 目标
把当前首页最底部的"你说过的每一句"彻底移除，改造成一个真正意义上的 **History（历史记录）** 入口，符合成熟 AI Agent 产品（ChatGPT / Claude / Perplexity）的直觉。

## 设计意见

首页的核心是 **"此刻你想说什么"**，一切历史都不该在视觉上与之抢戏。历史记录应满足：

1. **入口克制** — 在 header 有一个常驻但轻量的入口，不占据主视线。
2. **打开即沉浸** — 打开后是一个专注的历史空间（抽屉 or 独立页面），不是首页附赠品。
3. **命名中性** — 使用 "History / 历史" 这种用户一眼懂的词，而不是文艺化的 "你说过的每一句"。产品文案的诗意留给 greeting，功能区必须直白。

我推荐 **右上角 header 入口 + 侧边抽屉（Drawer from right）** 的方案，理由：

- 抽屉可从任意页面（首页、side-by-side、matchmaker、connections）打开，历史是全局的
- 不打断当前对话；点历史条目会跳转到对应 session 详情页
- 移动端体验更好，符合 ChatGPT app 的心智模型
- 也保留 `/sessions` 独立路由作为「查看全部」的落地页，便于分享/直达

## 具体改动

### 1. 首页移除历史区
- `src/components/home.tsx`：删除 `<SessionList limit={5} showViewAll />` 及其上方的 `agents_footnote` 之后不再需要的间距。
- `src/components/session-list.tsx`：不再从首页调用，但保留组件本身用于抽屉和 `/sessions` 页。

### 2. Header 新增 History 入口（全局）
- `src/components/home.tsx` header 右侧：在 Connections 与 Profile 之间新增一个按钮 `History`（图标：`Clock` 或 `History` from lucide-react），点击打开抽屉。
- `src/routes/side-by-side.tsx` / `src/routes/matchmaker.tsx` / `src/routes/connections.tsx` 的顶部 header 也需要一致的入口（保持全局可达）。为避免重复，抽出一个 `<HistoryTrigger />` 组件放在 `src/components/history-trigger.tsx`，各页 header 引用。

### 3. 新建 History 抽屉
- `src/components/history-drawer.tsx`：使用现有 shadcn `Sheet`（右侧滑出）。内容：
  - 顶栏：标题 `t("history.title")` = "History" / "历史"、关闭按钮、右上角 `查看全部 →` 链到 `/sessions`
  - 主体：复用 `SessionList`（默认展示 8 条），每条点击后跳转对应 session 详情页并关闭抽屉
  - 空状态：一段克制的说明 + 引导回到首页开始新的对话
- 抽屉状态用组件内部 `useState`，`HistoryTrigger` 通过 `Sheet` 的受控 API 打开。

### 4. `/sessions` 页面轻改
- `src/routes/sessions.tsx`：把标题从 "你说过的每一句" 改为 `t("history.page_title")` = "History" / "历史"；页面副标题去掉多余修饰，改为一句功能性说明。

### 5. 文案（i18n）
- `src/locales/{en,zh-CN}/common.json`：
  - 新增：`history.title`、`history.page_title`、`history.subtitle`、`history.empty`、`history.view_all`、`home.history`（header 按钮文案）
  - 删除：`home.sessions_title`（首页那句"你说过的每一句"）如仅此处使用

### 6. `ActiveWishBanner` 保留不动
它承担的是"当前状态"的角色，与 History（沉睡记录）职责不冲突，仍显示于首页 greeting 上方。

## 视觉规格
- Header 按钮沿用 Connections/Profile 的样式：`text-[12px] text-foreground/80 hover:text-foreground hover:bg-secondary`，图标 `Clock` w-3.5 h-3.5。
- Drawer 宽度：`sm:max-w-md`，从右滑入。
- Drawer 中每条记录沿用 `SessionList` 现有卡片密度，不再重复设计。

## 不做的事
- 不加搜索、不加过滤器、不加分组（按天/按 agent）——列表短，无需分层。
- 不删除会话，不改 session 数据结构。
- 不改 `/side-by-side` `/matchmaker` 详情页内部逻辑。
- 不动 `ActiveWishBanner`。

## 变更文件一览
| 文件 | 变更 |
|---|---|
| `src/components/history-trigger.tsx` | 新建 — header 按钮 + 抽屉容器 |
| `src/components/history-drawer.tsx` | 新建 — Sheet 内容 |
| `src/components/home.tsx` | 移除 SessionList；header 引入 HistoryTrigger |
| `src/routes/side-by-side.tsx` | header 加入 HistoryTrigger（如已有 header） |
| `src/routes/matchmaker.tsx` | 同上 |
| `src/routes/connections.tsx` | 同上 |
| `src/routes/sessions.tsx` | 标题改为 History |
| `src/components/session-list.tsx` | 保留，微调（用于抽屉时不显示 "查看全部"，由外层控制） |
| `src/locales/en/common.json` | +6 keys，−1 key |
| `src/locales/zh-CN/common.json` | +6 keys，−1 key |
