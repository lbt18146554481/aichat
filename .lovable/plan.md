## 我发现的三个问题

**1. Save 按钮点击后不"变黑"**
`meet-canvas.tsx` 的 Saved 态用的是 `border-foreground/60 bg-secondary`，是很淡的灰底，你之前指的"变黑"（`bg-foreground text-background`）没了。视觉上根本看不出被收藏。

**2. 对话框上方看不到 Saved 入口**
`SavedTrigger` 只在 `count > 0` 时渲染，逻辑没错。但如果 Header 上确实一直不显示，最可能的原因是 `sessionId` 为空导致 `saveCurrent` 里 `saveIntentGlobal(id, sessionId)` 那个分支不执行——`saveCurrent` 只在 `sessionId` 存在时才写全局 store（`else if (sessionId)`），所以在没有 session 上下文的匹配下点收藏，Header 就永远不会亮起。这是个静默失败的 bug。

**3. "1 more waiting" 没实际用处**
它只是在匹配卡右上角挂个数字，既不引导下一步、也不代表状态；"看下一个"按钮本身就承担了池子的语义。留着只是噪音。

## 修复方案

### A. Save 按钮回到"变黑"
`MatchView` 里 Save 按钮的样式改成两态清晰对比：
- 未收藏：白底描边（保持不变）。
- 已收藏（`isSaved` 为 true）：`bg-foreground text-background border-foreground`，图标切到 `BookmarkCheck`，文案 `Saved / 已收藏`。
和"开始聊"的主按钮同样是黑色，用户一眼看到"这个已经收进去了"。

### B. Saved 全局写入不再依赖 sessionId
`src/lib/agents/side-by-side.ts` 的 `saveCurrent`：
- 收藏时即使 `sessionId` 缺失也要写入全局 store，用空串或 `state.myIntentId` 作为回退标识，保证 Header 的 count 一定会 +1。
- 抽屉里"来自哪条心愿"在 `sessionId` 缺失时优雅隐藏（不显示那行小字），不阻塞主流程。

再顺手确认：`SavedTrigger` 已经挂在 `WorkspaceHeader` 和 `home.tsx` 上，`side-by-side` 页面走的是 `WorkspaceHeader`，所以 Header 入口的渲染路径没问题——修完 A/B 后就会出现。

### C. 移除"1 more waiting"
在 `MatchView` 里删掉 `remaining` 展示区块（含 `intent.pool_remaining` 文案调用）。
"看下一个"按钮保留 `disabled={remaining === 0}` 的禁用逻辑（池子空时不能继续），但不再显示数字。
从 `en / zh-CN` locale 删除 `intent.pool_remaining` key。

### D. 顺手校对 Save 之后的引导
Save 之后 assistant 那句 `intent.narrate_saved` 之前提到过"去顶部看"，确认文案在中英文里都还是"顶部 Saved 里能找到"，用户点完能感知到入口在哪里。

## 变更文件

- `src/components/canvas/meet-canvas.tsx`：Save 按钮样式两态；删除 `remaining` chip。
- `src/lib/agents/side-by-side.ts`：`saveCurrent` 无 sessionId 时也写全局。
- `src/components/saved-trigger.tsx`：抽屉里 `wishSummary` 缺失时不渲染那行。
- `src/locales/en/common.json`、`src/locales/zh-CN/common.json`：删除 `intent.pool_remaining`；确认 `intent.narrate_saved` 文案指向顶部。

## 不动的部分

- Saved store 结构、Header 入口渲染逻辑、生命周期规则都保持上一轮方案。这次只做视觉纠正、bug 修复和减法。
