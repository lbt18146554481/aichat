## 承接上版，只补一件事：解析不确定时怎么办

上一版流程本身不变——**单输入框 → 本地解析 → 至多追问 1 次 → 候选卡 → 打招呼/换一个**，两轮硬上限。

这次要想清楚的是：**本地关键词解析会失败**。用户可能写"这周有点闷想出去走走"、"想找人打球但不知道打什么"、"周末上午或者晚上都行，看谁有空"。纯 LLM 不现实（成本、延迟、离线），纯关键词又太脆。所以要设计一个**分层解析 + 明确兜底**的机制，让用户在任何输入下都能顺畅往下走。

## 解析分层（本地，零 LLM）

对每次输入跑三层，逐层降级：

**L1 · 关键词命中**
- `kind` 词表：网球/tennis、跑步/run、攀岩/爬、做饭/cook、看展/exhibit、书店/book……每个 kind 维护中英同义词 + 常见口语（"打球"暂不归类，见 L2）。
- `when` 词表：周末/weekend、工作日/晚上/weeknight、任意/都行/any；识别"周六上午"这类具体表述时映射到最近的 tier（weekend）。
- `level` 词表：新手/入门/beginner、会打/一般/intermediate、不错/进阶/advanced；只在 kind ∈ {tennis, climb} 时才尝试识别。

L1 命中即写入 slot，其余保持 undefined。

**L2 · 歧义候选**
关键词命中多个 kind 或撞到模糊词（"打球"→ tennis？；"出去走走"→ 不确定）时，不猜，记为 `ambiguousKinds: string[]`，交给 UI 展示 chip 让用户点。

**L3 · 完全无命中**
`kind` 仍为空且 `ambiguousKinds` 也为空 → 视为"没听懂"，走兜底 chip。

## 决策规则（在上版基础上加两条）

按优先级只走一条：

1. **完全没听懂**（L3）→ 温和回复 + 6 个 kind chip 兜底。文案："我只在这几件事上认识人，选一个继续。"
2. **kind 有歧义**（L2）→ 反问一句 + 候选 chip。文案："你说的是这个吗？" + `[网球] [其他运动 →]`（其他运动展开成 chip 面板）。这一步**不计入两轮上限**，因为是澄清而非追加信息。
3. **kind 确定，判断是否需要追问 when/level**（沿用上版）→ 候选人 > 3 且槽位缺才问，一次一个 chip。
4. **信息够** → 直接出候选卡；无匹配 → near-miss。

**两轮上限重新界定**：`askedCount` 只统计"追加信息"的问题（when/level）。歧义澄清不计入，因为它只是把已经模糊说过的东西点清楚，不是让用户多想一次。上限依然是"最多 1 次追加追问"。

## 输入长度与噪音处理

- 输入 > 140 字符 → 截断到前 140 字符再解析（避免长段落走 L3）；UI 在输入框下方轻声提示"抓了前几个关键词"。
- 输入含多个候选 kind（"想跑步或者打网球"）→ 归入 L2 歧义，chip 让用户二选一。
- 输入含否定（"不想跑步"）→ 忽略否定后的 kind，避免误命中；若否定后无其他 kind，走 L3。
- 空格/标点/emoji 全部规范化后再匹配。

## UI 状态机（一张表看完）

```
PromptView  →  submit(text)
                 │
                 ├─ L3            → FallbackChipsView  (选 kind chip → 视为新一轮 submit)
                 ├─ L2            → DisambiguateView   (选 chip → 补齐 kind，走下一步)
                 ├─ L1 + 缺槽位   → AskView            (chip 答 when 或 level)
                 ├─ L1 + 有匹配   → CandidateView
                 └─ L1 + 无匹配   → NearMissView
CandidateView 
  ├─ 打个招呼      → sayHello() → /connections   (终止)
  ├─ 换一个        → next candidate；池尽 → EmptyView
  └─ 重新说一句    → PromptView (空输入)
```

四种视图（PromptView / DisambiguateView / AskView / CandidateView）+ 两种子状态（FallbackChips、NearMiss、Empty 复用视觉），比上版多了一个 `DisambiguateView`，其余不变。

## 技术改动

**`src/lib/agents/side-by-side.ts`**
- `parseIntent(text, lang) → { kind?; when?; level?; ambiguousKinds?: string[]; layer: "L1"|"L2"|"L3" }`。词表拆到同文件顶部常量。
- `nextStep(state) → { view: "prompt"|"disambiguate"|"ask"|"candidate"|"nearmiss"|"fallback"; slot?: "when"|"level"; options?: string[] }`：单一决策函数，UI 只看它返回什么。
- `SideState` 增：`pending: { slot } | null`、`askedCount: number`（上限 1）、`ambiguousKinds: string[] | null`。
- `submitPrompt(state, text, lang)`、`answerSlot(state, slot, value)`、`resolveAmbiguity(state, kind)` 三个 action。
- level 加入 `findAllMatches` 的软过滤（差 2 档扣分，`any` 或缺省不扣）。

**`src/components/canvas/meet-canvas.tsx`**
- 拆四个子视图 `PromptView` / `DisambiguateView` / `AskView` / `CandidateView`；`nextStep()` 返回值直接 switch。
- 删除旧 `FormView`/`EditForm`。

**`src/routes/side-by-side.tsx`**
- 三个 handler：`handleSubmitPrompt(text)`、`handleAnswerSlot(slot, value)`、`handleResolveAmbiguity(kind)`。其余（sayHello、swap、reset）复用。

**locales（zh-CN + en）**
- 新增：`meet.prompt_placeholder`、`meet.prompt_hint`、`meet.parse_fallback`、`meet.disambiguate_ask`、`meet.ask_when`、`meet.ask_level`、`meet.heard_you`、`meet.retry_prompt`、`meet.truncated_hint`、`meet.when.{weekend,weeknight,any}`、`meet.level.{beginner,intermediate,advanced,any}`。
- 删除：旧 slot 网格 / area / 表单 chips 相关键。

## 验收

1. `/side-by-side` 首屏只有输入框。
2. "周六上午想打网球" → 追问水平 → chip 后出卡（L1 + 追问）。
3. "想打网球"（候选 ≤ 3）→ 不追问，直接出卡。
4. "想跑步或者打网球" → 走歧义 chip → 选完直接出卡（不再算作追加追问）。
5. "这周想出去走走" → 走兜底 6 chip。
6. "不想跑步，想找人一起做点别的" → 走兜底 6 chip（否定过滤生效）。
7. 输入 500 字长段落 → 截断解析，若命中 kind 走正常流程 + 显示 truncated_hint。
8. 无匹配 → near-miss；池尽 → "都看过了" + 重新说一句。
9. "打个招呼" → 跳 `/connections`，thread 有 opener。
10. `tsgo --noEmit` 通过。

## 为什么这样够用

- **不靠 LLM**：三层词表 + 决策函数全部在 client 跑，零延迟零成本，离线可用。
- **不脆**：L2 歧义、L3 兜底、长文本截断、否定过滤四个补丁覆盖了"关键词解析必然失败"的常见形态。
- **不啰嗦**：澄清（歧义）不占追问额度，用户体感依旧是"说一句 + 至多点一次 + 看卡"。
- **可扩展**：以后要接 LLM 兜底，只需在 L3 之前插一层，UI 状态机不用改。
