## 目标
在不改动现有视觉调性（极简黑白 + serif italic）的前提下，把整站移动端体验重构为一套"手机 App 布局"：底部 Tab Bar、全屏 Sheet、贴底 Composer、安全区适配、44px 触控热区。桌面端体验保持不变。

## 心智模型
- **桌面（sm+）**：沿用当前顶部头 + 居中大画布布局。
- **移动（< sm，≤ 767px）**：切换为「App 壳」——
  ```text
  ┌──────────────── status bar safe-area ────────────────┐
  │ 顶部：极简 title / 返回 / 右侧单个操作                  │
  ├──────────────────────────────────────────────────────┤
  │                                                      │
  │ 内容滚动区（overscroll-behavior: contain）             │
  │                                                      │
  ├──────────────────────────────────────────────────────┤
  │ Sticky composer（仅内容/聊天页）                        │
  ├──────────────────────────────────────────────────────┤
  │ Bottom Tab Bar（4 tab）+ home indicator 安全区          │
  └──────────────────────────────────────────────────────┘
  ```

## 全局壳：Tab Bar & Safe Area
- 新增 `src/components/mobile/tab-bar.tsx`：4 个 tab —— **Home / Chats（Connections）/ Saved / Me（Profile）**，仅在 `< sm` 显示；使用 `useLocation` 判断激活项；未登录时点击非 Home tab → 引导登录（复用 `useRequireAuth` 语义）。
- 新增 `src/components/mobile/app-shell.tsx`：为每个路由套上「flex-col、min-h-[100dvh]、pt-[env(safe-area-inset-top)]、pb-[calc(56px+env(safe-area-inset-bottom))] on mobile」，桌面下等同 `<>{children}</>`。
- 在 `src/routes/__root.tsx` 中统一挂载 `<TabBar />`（仅移动端渲染），避免每个页面单独放。
- 未读点（Chats tab）复用 `hasUnseen()`。

## 首页 (`src/components/home.tsx`)
- 顶部 header 在移动端**隐藏**：Kindred 徽标不占空间，`SavedTrigger` / `HistoryTrigger` / Connections / Profile 均下沉到 Tab Bar 或右上角单个「⋯ 更多」按钮。语言切换 & 账号菜单收到 Me tab。
- 主体：顶部一段更小的 greeting，Composer 变成 **贴底 sticky**（`pb-[env(safe-area-inset-bottom)]`）—— 用户拇指区一步触达；chip（Introduce / Together）横向 pill 组浮在 composer 上方；发送按钮尺寸 ≥ 40×40。
- 桌面端保持当前设计不变（用 `sm:` 分支切换）。

## 聊天型页面
覆盖：`src/routes/matchmaker.tsx`、`src/routes/side-by-side.tsx`、`src/components/canvas/connection-thread.tsx`。
- 移动端使用 100dvh 布局：**头部（52px）+ 消息滚动 + Sticky Composer**。
- Composer 使用 `position: sticky; bottom: 0`，附带 `env(safe-area-inset-bottom)` 缓冲；焦点时用 `scrollIntoView({block:'end'})` 保证最新消息可见（iOS Safari 键盘遮挡）。
- 左右双栏（Agent 私聊 + 匹配画布）在移动端改成 **Segmented Tab**（顶部两枚 pill：`Agent` / `Match`），不再左右并列；桌面保持并列。
- 「返回」使用 `router.history.back()` + 左上角 `<` 图标，44×44 触控区。

## Connections 列表 & 详情
- 列表页（`src/routes/connections.tsx`）：完整全屏列表，行高 ≥ 64px，右侧未读点；点击行 push 进入 `/connections?thread=...` 全屏对话（移动端不再分栏）。
- 详情视图 iOS 风格头部：头像 + 名字居中，返回位于左上；`⋯` 菜单收纳撤回/移除。
- 桌面保持左右分栏。

## Saved / History
- Sheet 触发器改为 **Sheet 全屏**（移动端 `side="bottom" + h-[92dvh] + rounded-t-2xl`），带 drag handle；桌面保留原右侧 Sheet。
- 内部 tab（People / Wishes / History）沿用现状，仅调整触控高度与滚动。

## Profile & Auth
- Profile 页移动端顶部收起为 sticky 极简 bar；Auth 页表单在移动端居中并将 CTA 贴底以贴合拇指区。
- Auth 页与 Profile 页在移动端**不显示**底部 Tab Bar（视为模态流程）。

## 通用移动交互细节
- 触控最小 44×44（按钮、chip、Tab 项）。
- 所有可滚动区加 `overscroll-behavior: contain`；主容器 `touch-action: manipulation`。
- `src/styles.css` 添加：`--safe-top / --safe-bottom` 变量；`.mobile-scroll { -webkit-overflow-scrolling: touch }`；`html, body { overscroll-behavior-y: none }`。
- 视口 meta：在 `__root.tsx` 补 `viewport-fit=cover, interactive-widget=resizes-content` 以让键盘正确压缩视口。
- 长按/双击/输入 focus 不放大：`user-scalable=no` + `input/textarea { font-size: 16px }` 防 iOS 缩放。

## 视觉保持不变（用户明确要求）
- 不改动颜色、字体、圆角、阴影 token；仅结构与尺寸。
- Tab Bar 也使用现有 border/muted-foreground 语义色，激活态用 foreground。

## 变更文件清单
- 新增：`src/components/mobile/tab-bar.tsx`、`src/components/mobile/app-shell.tsx`、`src/hooks/use-mobile.tsx`（若已存在则复用）。
- 修改：`src/routes/__root.tsx`（挂 TabBar、viewport meta）、`src/components/home.tsx`、`src/routes/matchmaker.tsx`、`src/routes/side-by-side.tsx`、`src/components/canvas/connection-thread.tsx`、`src/routes/connections.tsx`、`src/components/saved-trigger.tsx`、`src/components/history-trigger.tsx`、`src/routes/profile.tsx`、`src/routes/auth.tsx`、`src/styles.css`。
- 不新增依赖；不引入 AI Elements（此次纯 layout，不改 chat 语义）。

## 验收
- iPhone 14 (390×844) & 小屏（375×667）无横向滚动、Composer 贴底不遮挡键盘。
- 四个 Tab 之间切换在移动端顺畅，页面滚动位置各自保留（借助 `scrollRestoration`）。
- 桌面端（≥ 768px）UI 与当前完全一致——不引入回归。
- Chats tab 有未读点；点击 Connections 行直达对话。
- Home、Matchmaker、Side-by-Side、Connections、Saved、History、Profile、Auth 全部通过 iOS Safari + Android Chrome 手动预览。

## 不做
- 不接入 PWA / manifest / Service Worker。
- 不改视觉主题（颜色/字体/圆角），后续视觉方案独立迭代。
- 不迁移到原生 Capacitor / React Native。