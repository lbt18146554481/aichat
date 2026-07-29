
## 目标

1. **Agent 询问交互升级**：当前 `AgentAsk` 卡片只承载“把用户回答写回 profile”这一狭窄场景（补城市、补姓名等），卡片视觉窄、上下文缺失、也没体现“Agent 在向你请示”这种对话质感。要把它升级为一个通用的“Agent 请示”组件，能优雅承载多种意图。
2. **修复 bug**：Do something together 的右侧匹配卡上的 Save 按钮点击后视觉状态未切换（未生效或未反映到全局 Saved）。先定位再修复，不改动其他逻辑。

---

## 一、Agent 请示卡片（AgentAsk）升级

### 现状与问题

- `AgentAsk` 三个 kind（text / select / confirm）视觉几乎一样，都是一个白框 + 一行 prompt + 输入或按钮。
- 语义窄：现在只用来做「补城市 → 写回 profile」「补姓名 → 写回 profile」「撤回二次确认」。它在 UI 上暗示“回答即写进 Profile”，看起来像一个填表控件而不是 Agent 的一次「请示」。
- 缺 Agent 身份：卡片没有头像/标签/图标，跟对话上下文脱节。
- 缺“为什么问”：用户看不到 Agent 为什么突然需要这个信息（是为发布心愿？打招呼？还是回撤？）。
- 卡片过窄、按钮排布挤，移动端上信息层级不清。
- 目前 `text` 类型只支持单行 input，遇到“再描述一下你希望的人”这种自由文本请示会不够用。

### 重新定义

`AgentAsk` = 「Agent 在对话流里请你完成一件小事以继续」，不局限于填 Profile。它是 Agent 的一次「请示」，可能是：

- **补一个事实**（例：所在城市、想约的时间段） — text/select
- **确认一个动作**（例：撤回心愿、放弃这个人） — confirm
- **在几个方向里挑一个**（例：换个活动 vs 放宽时间 vs 放宽水平） — select
- **可选的一次自由输入**（例：给 TA 写点具体的开场语气建议） — text（长文本）
- **可跳过**：几乎所有请示都要允许「跳过 / 稍后再说」，Agent 不能把对话卡死

新增两个能力：

- `kind: "text"` 支持 `multiline?: boolean`，长文本用 textarea（3 行起，可自增到 6 行）。
- 卡片头部新增可选的 `intent` 元信息：`{ scope: "wish" | "hello" | "profile" | "action", icon?: ReactNode, label?: string }`。它决定卡片顶部的一个小标签，让用户一眼看出这次请示服务于什么目标。示例：
  - `wish` → 目标是发布心愿（图标：Sparkles，label：`补充心愿 · 城市`）
  - `hello` → 目标是打招呼（图标：MessageCircle）
  - `profile` → 与个人资料相关（图标：User）
  - `action` → 二次确认破坏性动作（图标：AlertTriangle，红色调）
- 底部动作行统一 3 类：主按钮（confirm/submit）、次按钮（跳过/稍后 / 打开 Profile）、可选 `Ghost 链接`（例：`我不想在这里回答` → 打开 Profile 页去改）。

### 视觉规格

- 卡片：`rounded-2xl border border-border bg-card`，宽度撑满对话气泡列宽（不再显得窄）。
- 顶部标签行：小写 uppercase 字号 10px，左侧图标 3.5，label 用 muted-foreground，右侧一个「跳过」轻链接（当 `skippable === true`）。这个标签一眼把「这是 Agent 的请示 + 这次请示要用来做什么」讲清楚。
- Prompt：14px / leading-relaxed / foreground，可含 `<strong>` 强调关键词。
- 输入区：
  - `text` 单行：h-11 rounded-lg，focus:border-primary/50。
  - `text` 多行（新增）：min-h-24 rounded-lg textarea，右下角字数计数（可选）。
  - `select`：chip 组，选中态用 primary/10 底色 + primary 文字，未选态维持现在样式。
  - `confirm`：两个按钮左右并列，主色遵循 tone。
- Resolved 状态：现在的灰色 pill (`✓ 记下了：Kyoto`) 保留，但增加一个 `编辑` 小按钮 → 点击后把 pill 变回可编辑的 Ask 卡片（用于「回答错了」的场景，避免用户被自己的一次输入锁死）。

### 语义清理

- 目前所有落地场景（补城市 / 补姓名）本质是「Agent 需要一个字段来继续动作」。改造后：
  - Ask 完成 → Agent 立刻**用**这个信息推进下一步（发布心愿 / 恢复 Hello 草稿）。这个已经在做，保留。
  - 是否把值回写到 Profile 由用户在卡片里另外勾选 `☐ 顺便记到我的资料里`（默认勾上，但可以取消）。这样解决“Agent 请示 ≠ 强制修改我的资料”这个心智错配。
- 撤回、放弃某个匹配这类破坏性动作用 `confirm` + `tone: "danger"` + 顶部标签 `scope: "action"`，视觉上和信息型请示明确区分。

### 涉及改动文件

- `src/components/agent-ask.tsx`：重写 `AgentAsk` type，扩展 `text.multiline`、新增 `intent` 头部标签、新增 `writebackToProfile` 勾选（仅在 profile 类字段出现）、Resolved pill 增加编辑入口。
- `src/components/workspace.tsx`：`AgentMsg.askResolvedLabel` 之外，需要新增 `onAskEdit` 回调（重新激活某条 Ask）。
- `src/routes/side-by-side.tsx` & `src/routes/matchmaker.tsx`：调用点补充 `intent` 元信息；把「写回 profile」从必然行为改为「同时更新 profile」的可选副作用，通过卡片勾选控制。
- `src/locales/en/common.json`、`src/locales/zh-CN/common.json`：新增 label / 勾选文案 / 编辑入口文案。

（不新增新的请示场景，只把现有 4 个请示场景（wish 城市、hello 姓名、hello 城市、revoke 确认）迁移到新版组件上；这样避免把范围铺大。）

---

## 二、修复 Save 按钮 bug

### 复现步骤

打开 `/side-by-side` → 发布一个心愿 → 出现一个匹配 → 点击右下角的 `Save` 按钮 → 期望：按钮变蓝、图标切换为 BookmarkCheck、Header 全局 `Saved` 徽章亮起。

### 排查思路（按顺序）

先只做定位，不改代码。

1. 用 preview JS 打印 `localStorage["kindred:saved-intents:v1"]` 在点击前后。
2. 检查点击是否触发 `handleSave → saveCurrent`：在 `side-by-side.ts:saveCurrent` 首行打点（临时 console，仅调试期）。
3. 检查 `state.matchIntentId` 是否非空、`getIntentById(state.matchIntentId)` 是否非 null。
4. 检查 `useIsSaved` 是否触发订阅回调（`subscribeSaved` 里 `listeners` 是否被外部 write 触发）。

### 已知可疑点

- `listSaved()` 里 `.filter((r) => !!getIntentById(r.intentId))` 会把「Intent 不在当前 people/intents 池里的记录」过滤掉。demo 里 matchIntentId 是从 `findMatchFor` 拉来的，理应存在；但如果 seed 数据在某些路径下没被登记进 `getIntentById`，会造成：写进 localStorage 后立刻被 `listSaved()` 过滤掉，`useIsSaved` 恒为 false → 按钮永远显示未保存状态。这是最可能的根因。
- 另一个可疑点：`useIsSaved` 只在 `intentId` 变化时重新订阅；如果同一个 `intentId` 触发 save 后 `subscribeSaved` 的回调没有触发（listener 未注册成功），也会不亮。需要检查 `listeners.add` 时机。

### 修复方向

- 若确认是 `listSaved` 过滤逻辑吃掉了记录：把 `useIsSaved` 改为直接读 `isSaved(intentId)`（不经过 `listSaved` 的存在性过滤），因为「按钮是否显示已保存」只关心 localStorage 里是否有这个 id，而不关心它是否还能被 `getIntentById` 命中。
- 若是订阅未触发：确认 `saveIntent → write → listeners.forEach(fn)` 链路完整，必要时把 `useIsSaved` 迁移到 `useSyncExternalStore`（和 SavedTrigger 里一致）。
- 修完后在预览里验证：点击 Save → 按钮切到蓝色 / BookmarkCheck / 文案 Saved → Header Saved 徽章数字 +1 → 再点一次能取消。

### 涉及改动文件

- `src/components/saved-trigger.tsx`（`useIsSaved` 实现）或
- `src/lib/saved-intents.ts`（视根因决定是否放宽 `listSaved` 过滤，或新增一个不过滤的 `hasSaved`）

不改 Save 相关的状态形状与写路径，只保证「点了 → UI 立刻反映」。

---

## 验证清单

- [ ] Ask 卡片：4 个现有场景（wish 城市 / hello 姓名 / hello 城市 / revoke）都用新版组件渲染，顶部标签、跳过、勾选写回 profile 均按场景显示或隐藏。
- [ ] Resolved pill 出现「编辑」按钮，点击后能重新回到 Ask 卡片状态。
- [ ] 移动端键盘弹出时 Ask 卡片仍在可视区域，不被输入框遮挡（沿用已有 `useKeyboardInset` 机制）。
- [ ] Save 按钮点击后 500ms 内变为已保存态；Header Saved 数字 +1；再点一次能取消。
- [ ] 不引入新的 hooks 顺序问题；`bun run typecheck` 通过。
