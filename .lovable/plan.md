# Side by Side 重做：回到 Agent 对话形态

## 我理解的问题

现在的 `/side-by-side` 是一个独立的中央大卡片页（PromptView / DisambiguateView / FallbackView / AskView / CandidateView 轮播），跳出了 Agent 应有的对话形态。你想要的是：

- 和 `/matchmaker` 一样的 **Workspace 布局**：左侧对话流，右侧候选画布，底部一个统一的输入框。
- 用户在对话框里说一句话 → Agent 用**对话消息**回应（听到了什么 / 需要补充什么）。
- 需要更多条件（时间、水平、澄清歧义）时，Agent 在**对话里追问**，chip 出现在助手气泡下方，不是全屏切页。
- 最终匹配到人时，右侧画布出候选人卡；点"打个招呼"跳 `/connections`；点"换一个"右侧刷新，对话流保留。

## 新流程（起 / 中 / 结束）

**起**：进入 `/side-by-side`，左侧对话流里 Agent 开场一句"想和谁做点什么？随便说。"，右侧画布空态（占位插画 + 一行说明）。输入框获得焦点。

**中**（全部发生在同一个对话窗口里）：
1. 用户在输入框说话（例："周六上午想打网球"）。
2. Agent 复述听到的内容（"听到了：网球 · 周末 · 想找个搭子"）作为一条助手消息 —— 让用户随时能校准。
3. 决策（复用现有 `parseIntent` + `nextStep`）：
   - **L3 兜底** → Agent 消息"我只在这几件事上认识人"+ 6 个 kind chip（chip 挂在这条消息下方，点击等价于用户又说了一句）。
   - **L2 歧义** → Agent 消息"你说的是哪个？"+ 候选 kind chip。
   - **L1 缺槽位 & 候选 > 3** → Agent 消息"周末的话人挺多，你偏向什么水平？"+ chip（when 或 level 二选一，至多一次）。
   - **信息够** → Agent 消息"给你看一个"，右侧画布出候选卡。
   - **无匹配** → Agent 消息 + near-miss 建议（也做成 chip 挂在消息下）。
4. 用户任何时候都可以直接在输入框重说一句，Agent 就当作新一轮开始（清空 pending / askedCount）。

**结束**：
- 用户在右侧候选卡点"打个招呼" → 写入 connection + opener，跳 `/connections`。这是 Side by Side 的唯一"完成"出口。
- 用户点"换一个" → 右侧换下一个候选，对话里追加一句"再看一个"。
- 池子用尽 → Agent 说"这一轮都看过了，要不换个说法？"，画布回空态，输入框重新聚焦。

## 关键设计判断

- **不做侧边表单、不做全屏 chip 页**。所有澄清都是"助手消息 + 消息下方的 chip"，视觉上是聊天的一部分，不打断上下文。
- **候选卡只在右侧画布**，和 Matchmaker 一致。左侧永远是对话。
- **chip 是可选快捷**，不是强制路径。用户随时可以打字覆盖。
- **一次追问上限保留**（`askedCount ≤ 1`，只统计 when/level 追问；歧义澄清和兜底选择不计入），这条从上一版继承，不变。

## 技术改动

**`src/components/canvas/meet-canvas.tsx`** — 大幅收缩
- 删除 PromptView / DisambiguateView / FallbackView / AskView 四个左侧视图。
- 只保留右侧画布用的两种视图：`CandidateView`（候选人卡 + 打招呼/换一个）、`EmptyCanvasView`（空态：图 + "说一句，就在这里认识一个人"）、`NearMissView`（可以合并进 EmptyCanvasView，用文案区分）。
- 组件签名简化为 `MeetCanvas({ state, onSayHello, onSwap })`，其他 handler 不再需要（澄清/追问/兜底都改到聊天流里）。

**新增 `src/components/canvas/meet-chips.tsx`**（或直接内联到 side-by-side 路由）
- 一个把 chip 列表渲染成"助手气泡下的一排 pill"的小组件，供聊天流复用。

**`src/lib/agents/side-by-side.ts`** — 保留解析器，加对话消息
- 保留：`parseIntent` / `nextStep` / `findAllMatches` / `makeOpener` / L1-L3 / 否定 / 截断 / askedCount 上限。
- `SideState` 增加 `messages: AgentMsg[]`（沿用 `src/components/workspace.tsx` 里的类型）。
- 新增 helper：`echoHeard(intent, lang)` 生成"听到了：X · Y · Z"的助手复述文案。
- 每个 action（`submitPrompt` / `resolveAmbiguity` / `chooseFromFallback` / `answerSlot` / `swap` / `restart`）在返回新 state 时**同时 append 对应的 user / assistant 消息**，并把当前应该展示的 chip 组挂到最后一条助手消息的 `chips` 字段上（扩展 `AgentMsg` 类型加可选 `chips?: { label: string; value: string; kind: "kind"|"when"|"level"|"nearmiss" }[]`）。
- `nextStep` 保留但只用于内部决定要不要追问 / 出候选，不再直接驱动 UI。

**`src/components/workspace.tsx`** — 极小改动
- `AgentMsg` 加可选 `chips`。
- `AssistantBubble` 在有 `chips` 时，气泡下方渲染一排可点击的 pill；点击回调冒泡给 Workspace 消费者。给 `Workspace` 加一个可选 `onChipClick?: (msgId, value) => void`。

**`src/routes/side-by-side.tsx`** — 换成 Workspace 布局
- 参照 `src/routes/matchmaker.tsx` 的写法：使用 `Workspace`，`rightPane={<MeetCanvas ... />}`。
- `onSend(text)` → `submitPrompt`；`onChipClick(msgId, value)` 根据 chip 的 kind 分发到 `resolveAmbiguity` / `chooseFromFallback` / `answerSlot` / `tryNearMiss`。
- `thinking` 状态复用 Matchmaker 的 `setTimeout(500)` 节奏。
- 保留 `handleSayHello` → `sayHello` → 跳 `/connections`。

**locales（`src/locales/{en,zh-CN}/common.json`）**
- 删除：`meet.prompt_placeholder` / `meet.disambiguate_ask` / `meet.parse_fallback` / `meet.retry_prompt` 里只在旧全屏视图用到的键。
- 新增：`meet.opening`（开场白）、`meet.heard`（"听到了：{summary}"）、`meet.ask_when` / `meet.ask_level`（改成对话口吻）、`meet.disambiguate`、`meet.fallback_intro`、`meet.no_match`、`meet.pool_exhausted`、`meet.showing_one`、`meet.swap_note`、chip 的 kind 名（复用现有 `meet.kind.*` 若有）。
- 复用 `chat.placeholder_first` / `chat.disclaimer`。

## 验收

1. `/side-by-side` 打开就是左对话右画布的 Workspace 布局，输入框在底部，和 `/matchmaker` 结构一致。
2. Agent 开场消息在左侧对话流第一条。
3. 输入"周六上午想打网球" → 左侧连出两条助手消息（复述 + 追问水平 chip）→ 点 chip 或再打字 → 右侧出候选卡。
4. 输入"想跑步或者打网球" → 左侧助手消息带两个 kind chip；点选 → 继续正常流程；这次澄清不算入追问额度。
5. 输入"这周想出去走走" → 左侧兜底消息 + 6 个 kind chip。
6. 无匹配 → 左侧消息 + near-miss chip；池尽 → 消息提示"再说一句"，右侧回空态。
7. 右侧候选卡"打个招呼" → 跳 `/connections`，thread 有 opener。
8. 右侧"换一个" → 左侧追加一条"再看一个"、右侧刷新，无对话被清空。
9. `tsgo --noEmit` 通过。

## 为什么这样对

- **回到 Agent 形态**：所有交互都在同一个对话窗口里，用户体感和 Matchmaker 一致，不再有"页面切来切去"。
- **保留上一版的解析强度**：L1/L2/L3、否定、截断、追问上限全部保留，只是**呈现层从全屏视图换成聊天消息**。
- **落脚点仍是沟通**：唯一的"结束"信号是点候选卡的"打个招呼"跳去 `/connections`，符合你上次说的"最终落脚点是沟通交流"。
