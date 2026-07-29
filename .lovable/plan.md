## 目标
1. 彻底重写左侧 Agent 对话中「补充信息」的交互，让它像 Lovable 那样——**只为完成当前这一次动作而临时问一句**，不再默认写回 Profile、不再声称"我会记住"。
2. 移除右侧匹配页里让用户"告诉 Agent" 的输入框（`WhyPersonBox` 里的 amber "fresh" 分支）——所有补充信息都只发生在左侧 Agent 对话里，右侧只呈现结果。
3. 修复匹配用户卡片下方那句 "June is an architect in Brooklyn..." 的**信息来源问题**——不再展示系统编造的第三人称 `portrait`，只展示可归因的信息。

---

## 一、左侧 Agent 「补充信息」交互重写

### 现状问题
- `AgentAsk` 的 text 类型带 `writebackToProfile` + 默认勾选的「同时记住到我的资料」复选框 → 用户答一句城市，就默默改了 Profile。
- Matchmaker 的缺 name/city 会触发 `handleNeedProfile`，卡片上是"Profile" scope tag，暗示这是资料补全。
- Side-by-side 的缺城市 ask 也走同一套 writeback 逻辑。
- 结果：把"临时提供上下文"和"永久修改个人资料"混在一起，用户体验混乱。

### 新模型（对标 Lovable）
Agent 只是**问一句以便继续当前动作**，不做任何持久化：

- 移除 `writebackToProfile` / `writebackDefault` / `writebackLabel` 字段与复选框 UI；`onResolve` 签名简化为 `(value: string | null) => void`。
- 卡片视觉更轻：去掉 scope 大标签，改成一行浅色前缀「Agent 想确认一下 · 只用于这次」/ "Just for this — "，明确"临时"。
- 按钮文案：主按钮 `Continue`（继续 / 就用这个），次按钮 `Cancel`（不了）。不再叫 Save/Pass。
- 已解决 pill：`AgentAskResolved` 保留但去掉 Pencil「修改」按钮——一次性输入不需要"编辑"，用户改主意就取消当前动作重来。

### 各调用方改造
**`src/routes/side-by-side.tsx`**：`handleSend` 里检测到无城市时，仍然弹 ask 卡；但拿到值以后**只写进 `pendingWishText` 对应的一次匹配**，不再调 `saveProfile`。方案：给 `submitPrompt(state, text, opts?)` 加可选 `cityOverride`，把用户答的城市作为本次心愿的 `Intent.city` 覆盖。Profile 城市保持不变。resolved pill 文案改为 "Matching in {city} · just for this wish"。

**`src/routes/matchmaker.tsx`**：`handleNeedProfile` 里 name/city 不再写 `saveProfile`。改为把答案存进一个组件内 `oneShotIdentityRef`（`{ name?: string; city?: string }`），Say hello 走 `HelloComposer` 时优先读该 ref，不存在再读 Profile。resolved pill 文案改为 "Introducing you as {name} · just for this hello"。name/city 都不再链式追问，只在 Say hello 真正需要哪个时才问哪个。

**`AgentAsk` 类型**：删除 writeback 相关三个字段；`AgentAskCard` 里删除复选框 JSX。相应更新 `src/components/workspace.tsx` 的 `onAskResolve` 签名（去掉第三个参数）。

**i18n**：删除 `ask.writeback_default`、更新 `ask.resolved_city` / `intro.ask_resolved_name` 等文案为"仅用于这次"的措辞。

### 右侧匹配页的自动补信息面板
`src/components/canvas/meet-canvas.tsx` 里的 `WhyPersonBox` 目前会在 `?fresh=1` 时渲染 amber 提示框 + 输入框让用户"告诉 Agent 想找什么样的人"。这条路径与左侧 Agent 的职责重复且混乱。

- 删除 `WhyPersonBox` 里 `hasTold=false` 分支的所有 UI 与相关 state（`draft` / `justSaved` / `TOLD_KEY`）。
- 保留 emerald "why is TA" 结果框。当 `person.whyPersonLine` 缺失时，不再展示 fallback 文案，而是**整块不渲染**——避免出现"没有信息源"的兜底句子。
- 相关 i18n key `intent.tell_agent_*`、`intent.why_person_fallback` 从两份 locale 移除。
- 如果确实需要用户补充"想要什么样的人"，让它以左侧 Agent Ask 的形式出现（属于本次匹配的临时上下文），不侵入右侧。

---

## 二、匹配用户卡片信息源问题

### 现状
`meet-canvas.tsx` MatchView 的身份行下方渲染：
```
personBioLine = person.portrait   // "June is an architect in Brooklyn..."
```
`portrait` 是 `src/lib/people.ts` 里预设的第三人称叙述——不是当事人自己写的，也不是可验证事实，用户合理地觉得"你并不知道这些"。同样问题出现在：
- `PublicProfileSheet` 里当 `bio` 缺失时 fallback 到 `portrait`
- `IntroCanvas` 里也读 `portrait_zh` 作为详情页画像

### 解决方案：只展示可归因信息
**规则**：卡片上"关于 TA" 的每一句都必须能指向来源。可用来源分两类：
- **事实类**（结构化字段）：`occupation` · `city` · `age`、`signals` 标签、`activities`、`favorites`。
- **自述类**（当事人自己写的）：`bio`、`moments[i].answer`（prompt 也一并展示）、`reflections[i].answer`。

**改造 MatchCanvas `MatchView`**：
1. 身份行保持不变（姓名 · 年龄 · 城市 · 职业——都是结构化事实）。
2. 删除当前 `personBioLine`（`portrait`）那行。
3. 若 `person.bio` 有值 → 渲染 bio，前面加一个极小的 attribution 标签 `In their words`（中文："他们的自述"），视觉上明确"这是 TA 自己写的"。
4. 若无 bio → 不再回退到 portrait；改为渲染 `signals` 标签云（前面加 `Signals` 小标签）作为"我们对 TA 已知的东西"的诚实呈现。
5. `WhyPersonBox` emerald 分支：`whyPersonLine` 存在才展示，且前面加 attribution `Agent's read`（中文："Agent 的判断")，明确这是 AI 归纳、不是 TA 自述。

**改造 `PublicProfileSheet`**：
- 删除 `bio ?? portrait` fallback；`bio` 缺失时不渲染 bio 段落，直接进入 signals + activities + moments + favorites。
- 每段加"来源"小标签：`In their words` / `Signals` / `What they do` / `Favorites` / `Moments`。

**改造 `IntroCanvas` 详情页**：
- 同样删掉把 `portrait_zh` 当"画像"渲染的位置；改为渲染 `bio`（有则显示，注明 In their words）与 signals + moments 组合。

**`portrait` 字段处理**：不删除类型/数据（会牵动大量 demo 数据），但**全站 UI 停止读取它**，加一行代码注释在 `Person.portrait` 类型定义处标注 `@deprecated — do not render, no attributable source`。

---

## 技术要点（技术细节）

- `AgentAsk` 类型 discriminated union 的 text 分支删掉三字段；`AgentAskCard` 的 TextAsk 组件删掉 `writeback` state 和 checkbox 段。
- `Workspace` 组件 props `onAskResolve` 签名收窄为 `(askId: string, value: string | null) => void`。
- Side-by-side 加 `pendingCityOverride` 到 `SideState`，或者更简单：把用户答的城市直接塞进 `pendingWishText` 之外的 `pendingCity`，`submitPrompt` 读一次即消费。
- Matchmaker `oneShotIdentityRef` 用 `useRef`，不入 localStorage、不入 state 持久化，页面刷新即失效——这正是"临时"该有的行为。
- attribution 小标签用统一样式：`text-[10px] uppercase tracking-[0.14em] font-mono text-muted-foreground`，与已有的 `ScopeTag` 风格一致。

## 需要改动的文件
- `src/components/agent-ask.tsx`（简化）
- `src/components/workspace.tsx`（签名）
- `src/routes/side-by-side.tsx`（一次性 city override）
- `src/routes/matchmaker.tsx`（一次性 name/city）
- `src/lib/agents/side-by-side.ts` / `src/lib/intents.ts`（`submitPrompt` 接受 cityOverride）
- `src/components/canvas/meet-canvas.tsx`（删 fresh 分支 & 归因展示）
- `src/components/canvas/intro-canvas.tsx`（去 portrait 依赖 + 归因标签）
- `src/components/public-profile-sheet.tsx`（去 portrait fallback + 归因标签）
- `src/lib/types.ts`（`portrait` 标注 deprecated 注释）
- `src/locales/en/common.json` & `src/locales/zh-CN/common.json`（新增归因标签 key、移除 writeback / tell_agent 相关 key、更新 resolved pill 文案）

## 验证
- 触发 side-by-side 无城市心愿 → 卡片文案「只用于这次」，无勾选框；填城市继续匹配后打开 `/profile`，Profile 城市未变。
- Introduce someone 缺 name → 同上，Profile name 未变；用一次名字打招呼后再回来仍会提示（因为没记住），符合"临时"约定。
- 匹配卡片下方不再出现 `portrait` 那行；有 bio 时显示带 `In their words` 标签的 bio，无 bio 时显示 signals。
- `WhyPersonBox` 不再有 amber 输入分支；emerald 结果始终带 `Agent's read` 归因标签。
- `?fresh=1` URL 不再让右侧出现输入框。