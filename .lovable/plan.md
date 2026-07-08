
# Side by Side 重新设计：意愿发布 → 双向匹配 → 直接开聊

## 我之前错在哪

我一直把 Side by Side 当"搜索候选人"来做——用户随手说一句，我在静态人物库里找像的展示出来。你要的其实是另一件事：

- **每个人（包括用户自己）都在往一个"意愿池"里发布一条"我想做什么 · 什么时候 · 什么水平"**
- **后台在这个池里做匹配**：同活动 + 时间兼容 + 水平兼容 = 一对
- **对上了就是对上了，直接聊**，没有"等 TA 回应"，也不跳去别的页面

所以之前出现的两个问题就都通了：
1. **匹配卡的信息看不出来源** → 因为对方那条意愿从来没被"发布"过，是我凭人物画像瞎凑的。正确做法是卡片上明明白白把双方各自发布的原话+被解析出的三要素并排放，一眼看清"你说了什么、TA 说了什么、系统凭什么把你们对上"。
2. **点"打招呼"莫名跳走** → 匹配已经成立，聊天就应该直接在这个 Agent 页面里发生。跳 /connections、等 TA 回应都是多余的。

## 新流程（一条线走完）

```text
[起] 空态画布：说一句想做的事
        │
        ▼
[意愿采集] Agent 在对话里把三要素补齐（活动/时间/水平）
   ├─ 缺时间 → chip 追问（周末/工作日晚上/都行）
   ├─ 缺水平（仅运动类）→ chip 追问（新手/一般/进阶/都行）
   └─ 三要素齐 → 生成一条 "我的意愿" 记录，写进意愿池
        │
        ▼
[后台匹配] 在池里找：同 kind + when 兼容 + level 兼容
   ├─ 有对上的 → 直接进 [对上了]
   └─ 无 → 进 [没对上]
        │
        ▼
[对上了] 右侧画布出"意愿对齐卡"：
   ┌─────────────────────────────────┐
   │ 你的意愿：              TA 的意愿：│
   │ "周六上午想打网球，进阶"  "周末想找人打网球" │
   │ 网球·周六上午·进阶       网球·周末·进阶     │
   │ ─────对齐点───── │
   │ 都想打网球 · 周六上午 · 进阶水平相当    │
   │ [开始聊天]                            │
   └─────────────────────────────────┘
   点 [开始聊天] → 右侧画布无缝切成聊天视图，
   顶部保留一条"意愿对齐"横幅，下面就是消息+输入框。
   不跳页、不等回应，直接可发消息。
        │
        ▼
[没对上] 对话说："这条意愿我先记下了，一有人对上就叫你。"
   右侧画布显示"已发布的我的意愿"卡（可编辑/撤回）
   + near-miss（同活动但时间/水平不完全一致的候选，展示 TA 的原话，可主动发起）
```

## 关键设计判断

### 1. "意愿池"是这个 demo 的核心概念

- 新建 `src/lib/intents.ts`：`Intent = { id, ownerId, kind, when, level?, rawText, createdAt }`
- 种子数据：为每个 person 生成 1–2 条 intent（原话 + 三要素），写死在 `people-extras.ts` 或新建 `intents.seed.ts`。**这是"输入源"——匹配卡上展示的每一条 TA 的原话，都能追溯回这条种子 intent**。
- 用户提交的意愿也存进同一个池（localStorage），ownerId = "me"。
- 匹配函数 `matchIntents(myIntent)`：在池里筛 `kind === my.kind && whenCompatible && levelCompatible`，按契合度排序取第一个。

### 2. 匹配卡必须"看得见来源"

`CandidateView`（重写）分三块：
- **上：并排两条意愿原话**。左边"你说："引用用户刚才那句；右边"TA 说："引用对方 intent 的 rawText。两边下面各挂一行结构化 tag：`网球 · 周六上午 · 进阶`。
- **中：对齐说明**一句话："都想打网球 · 周六上午 · 进阶水平相当"。这是算法输出的可读版本。
- **下：一个主按钮 [开始聊天]**。没有"换一个"（匹配是对的就是对的；不满意可以在聊天里聊、或撤回自己的意愿重发）。

### 3. 点 [开始聊天] 不跳页

在 `side-by-side.tsx` 里加一个视图态 `stage: "match" | "chat"`。
- `stage === "match"` → 右侧显示对齐卡
- 点 [开始聊天] → `stage = "chat"`，右侧换成简易聊天视图（消息列表 + 输入框），顶部保留一条 slim 的"意愿对齐"横幅（点它可折叠展开完整对齐卡）
- 左侧 Agent 对话继续保留，但 placeholder 变成"想让 Agent 帮什么？"（比如"帮我想个开场白""换个约的时间"）——**左 Agent 右聊天**同时存在，这是 side-by-side 的字面意思也真做到了
- 聊天消息只存本 session（localStorage），因为这本来就是 demo；对方的回复用简单规则或延迟消息模拟一条

**不复用** `/connections` 页面。connections 是 Matchmaker 那条线的产物（从 moment 起手、需要 opener），Side by Side 是另一条线，直接在自己的画布里聊完。

### 4. "没对上"闭环（保留但简化）

- 用户的意愿依然会被"发布"进池，右侧显示"已发布"卡（原话 + 三要素 + [撤回] 按钮）
- 池里有同 kind 但时间/水平不完全对齐的人 → 右侧下方列出 near-miss，每条显示 TA 的原话 + tag + [看看] 按钮（点了就当作用户放宽条件重新匹配）
- 没有 waitlist 这个额外概念——"发布意愿"本身就是等待。之前那版 waitlist 是我自己叠的，删掉

### 5. 追问逻辑（保留但绑到"发布意愿"这个动作上）

- Agent 追问的目的从"缩小候选池"改成"补齐要发布的意愿"，这样用户能理解为什么被问
- 阈值：`kind` 必填；`when` 必填；`level` 仅对运动类必填
- 每一步最多问一次；用户答"都行"也算填了
- 三要素齐 → Agent 说"好，我把'周六上午想打网球，进阶'发到池子里了" → 触发匹配

## 技术改动清单

**新增**
- `src/lib/intents.ts`：`Intent` 类型、`publishIntent`、`revokeIntent`、`matchIntents(my)`、`nearMissIntents(my)`、`loadMyIntents`（localStorage）
- `src/lib/intents.seed.ts`：每个 person 的种子 intent（`ownerId`、`rawText`、结构化字段）

**重写**
- `src/lib/agents/side-by-side.ts`：`SideState` 改成 `{ collecting: {kind?, when?, level?, rawText}, stage: "collect"|"match"|"chat"|"nomatch", myIntentId?, matchIntentId? }`。删掉 waitlist 相关。`decide()` 三段：采集 → 发布 → 匹配。
- `src/components/canvas/meet-canvas.tsx`：`CandidateView` 换成"意愿对齐卡"（左右并排原话 + tag + 对齐说明 + [开始聊天]）；新增 `ChatView`（顶部 slim 对齐横幅 + 消息列表 + 输入）；`NearMissView` 简化为"已发布卡 + near-miss 列表"。删掉之前的"TA 也在等"绿徽标（用整张对齐卡替代）和 waitlist 卡。
- `src/routes/side-by-side.tsx`：新增 stage 切换；`handleStartChat`（match → chat）；`handleRevoke`（撤回自己的 intent 回到采集）；`handleSendChatMsg`（写右侧聊天消息，触发一条模拟回复）。

**删除**
- `src/lib/waitlist.ts`（整个文件）
- `common.json` 里 waitlist/mutual_badge 相关键，替换为 `intent.published`、`intent.aligned`、`intent.your_intent`、`intent.their_intent`、`intent.start_chat`、`intent.revoke`、`chat.slim_banner` 等新键

**不动**
- Matchmaker、connections、profile、home 全部不变
- Workspace / chat-primitives 结构不变

## 验收

1. 输入"想打网球" → Agent 追问时间 → 追问水平 → Agent 说"意愿已发布" → 右侧出对齐卡，卡上能同时看到我的原话+TA 的原话+对齐说明。
2. 点 [开始聊天] → **不跳页**，右侧变成聊天视图，输入框可发消息，能收到一条模拟回复。左侧 Agent 对话仍在，可以继续跟 Agent 说话。
3. 构造一个池里没人对上的组合（比如"想在凌晨三点滑雪，专业"）→ 对话说"已发布，等对上叫你"，右侧出"已发布卡" + near-miss 列表；点 near-miss 里的 [看看] 直接进入对齐卡视图。
4. 匹配卡上任何一条对方信息都能在 `intents.seed.ts` 里找到出处（demo 层面的"来源可追溯"）。
5. `/matchmaker`、`/connections` 完全不受影响。`tsgo --noEmit` 通过。

## 为什么这次对

- **"输入源"变得可解释**：因为每条匹配都由两条真实存在的 intent 记录支撑，卡片上就是把它们摆出来。
- **"直接聊天"符合直觉**：算法说对上了就是对上了，没有假装"等 TA 同意"的中间态；聊天就发生在 Agent 旁边，side-by-side 名副其实。
- **不再依赖 LLM 想象双方意图**：全部走结构化 kind/when/level 匹配，LLM 只负责在采集阶段做语义抽取和追问措辞，符合你说的"不能完全靠 LLM"。
- **删掉了 waitlist 这个自造概念**："发布意愿本身就是等"，少一个抽象。
