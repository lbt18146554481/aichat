# 把 Profile 门槛从"首页输入框"移到"Say hello 按钮"

## 目标

用户进 App 就能用 Agent、能看到候选人；只有在真正要联系对方（Say hello）时，才要求填 Profile。其它一切不动。

## 改动范围（只动这些）

### 1. `src/components/home.tsx`
- 移除输入框、chip、发送按钮的 `disabled={!profileReady}` 与 `opacity-60` 锁定态。
- 移除 `submit()` 里"未填 Profile 就跳 /profile"的分支，恢复正常路由到 Agent。
- 移除 `placeholder_locked` 分支，只保留正常 placeholder。
- 把当前那块大的 Profile Gate 卡片，换成一条**轻提示**（顶部一行小字 + "去完善"链接），文案例如："让 Matchmaker 也能这样介绍你 · 2 分钟"。已完成则不显示。
- 顺手修复"我/You"中英混排导致的 hydration mismatch：把顶部 header 里 Connections / Profile 两个链接的文字用 `suppressHydrationWarning` 包 span 或在 mounted 前不渲染文字（与现有 pattern 一致）。

### 2. `src/components/canvas/intro-canvas.tsx`（Say hello 按钮所在的地方）
- 点击 "Say hello" 时先检查 `isProfileComplete(loadProfile())`：
  - 未完成 → 弹一个轻量对话框（用现有 shadcn `Dialog`），标题一句："让 ta 看到你，而不是关键词"，正文一句"填 3 件事，约 2 分钟"，一个主按钮"去完善"跳 `/profile`，一个次按钮"以后再说"关闭。
  - 已完成 → 走原有的 HelloComposer 流程。
- Side by Side 侧如果也有触达对方的动作按钮，用同样的检查（若无则不动）。

### 3. `src/routes/profile.tsx`
- 完成 Profile 后，如果 URL 带 `?return=/matchmaker` 之类的回跳参数，填完自动 `navigate` 回去。没有则留在 `/profile`。
- 触发点（intro-canvas 的弹窗）传 `return` 参数过去。

### 4. 文案（`src/locales/{en,zh-CN}/common.json`）
- 新增 `home.profile_nudge`（轻提示条文案）。
- 新增 `hello.gate.title` / `hello.gate.body` / `hello.gate.cta` / `hello.gate.later`。
- 移除 / 保留不用的 `home.gate.*` 与 `home.placeholder_locked`（保留也无害，先不删）。

## 不动的东西

- 两个 Agent（Matchmaker、Side by Side）的架构、对话逻辑、understanding 面板
- Profile 页本身的表单、题池、字段
- `src/lib/profile.ts` 的 `isProfileComplete` / `profileProgress` 逻辑
- Seed 传递、路由结构、connections、meetings 等所有其它模块

## 验收

1. 全新用户进 App，能直接在首页输入框打字、提交，能进入 Matchmaker / Side by Side 正常对话、看到候选人卡。
2. 顶部只有一条不打扰的提示条引导去填 Profile；不再有大卡片、不再锁输入框。
3. 在候选人卡上点 "Say hello"，未填 Profile → 弹小对话框 → 去 `/profile` → 填完自动回到刚才那张卡，Say hello 按钮直接可用。
4. 已填过 Profile 的用户，Say hello 直接开 HelloComposer，无弹窗。
5. 首页顶部"Connections / Profile"链接不再产生 hydration mismatch。
