# 详情页左侧 Agent 的"补充 / 确认"交互

## 你实际想要的

不是"缺 Profile 才跳 /profile"这一个点，而是**左侧 Agent 在对话过程中，需要向用户要一小段补充或让用户确认某件事时，统一的一种交互**。像我现在给你回复计划时那样：**在对话流里就地问一句，用户就地答一句，答完就地继续，不打断整个流程、不跳页、不刷屏**。

## 触发这种交互的典型时刻

两个板块都在用同一个 Agent 对话框，以下情况都应走同一种"内嵌卡片"模式，而不是各自散着写：

**Do something together（`meet-canvas` 左侧 Agent）**
- 用户第一次发心愿，缺城市 → "先确认下你在哪个城市？"
- 用户说"周末打网球"，缺水平 → "你的水平大概是？初学 / 一般 / 进阶"
- 用户按了 Save for later → "记下来了。要不要顺便说下你希望 TA 是怎样的人？（可选）"
- 用户按了 Start chat 前 → "要不要用这条开场白？可改。"（预填 draft 让用户确认）
- 撤回心愿前 → "确认撤回？这条会从池子里移除。"

**Introduce someone（`intro-canvas` 左侧 Agent）**
- 用户按 Say hello 缺 name → "打招呼用哪个名字？"
- 用户按 Say hello 缺 city → "你在哪个城市？（用于展示给 TA）"
- Agent 建议了一条开场白 → "用这条发，还是改一改？"
- 用户说"想认识画画的人" → "记住了。要不要立刻按这个刷新一批人？"

## 统一的交互形态

**一张"Agent Ask"卡片**，出现在最新 Agent 消息下面（就是现在 `ChipRow` 的位置，取代或并列）：

```
┌ Agent 气泡 ────────────────────────────
│  先确认下你在哪个城市？
├────────────────────────────────────────
│  [ Kyoto___________________ ]     ← 单个 input / select
│  (Save & continue)  (Skip)         ← 主按钮 + 副按钮
└────────────────────────────────────────
```

规则：
- **一次只问一件事**。多个字段排队问，不并列。
- 主按钮：`Save & continue` / `Confirm` / `Use this` —— 保存后卡片折叠为一句灰色确认（`✓ 记下了：Kyoto`），Agent 立即接着说下一句。
- 副按钮：`Skip` / `Not now` —— 记为已问过，本会话内不再重复问；如果这项是**阻塞流程的必填**（如"发心愿必须有城市"），副按钮改为 `Open full profile ↗` 兜底跳 `/profile`（保留现有 return-URL 机制）。
- **确认类**（撤回、发送、跳转候选人）只出两个按钮，无输入框：`Confirm` / `Cancel`。
- **预填草稿类**（开场白）：input 预填 Agent 建议文案，用户可改可直接发。

## 移动端

- 卡片宽度 `w-full`，input `h-11`，按钮 `min-h-11`，主副按钮上下堆叠、`sm:` 起再横排。
- 卡片本体活在对话滚动流内，**不**做 fixed / sheet；键盘弹起时依赖浏览器自身把输入滚入视区，避免与底部 TabBar / composer 抢层级。
- 打字时 composer 顶部要留出足够 padding，保证卡片按钮不被系统输入条挡住（复用现有 `env(safe-area-inset-bottom)`）。
- Web 端沿用同一组件，天然响应式。

## 改动清单

1. **新组件 `src/components/agent-ask.tsx`**
   一个受控组件，props：
   ```ts
   type AgentAsk =
     | { kind: "text"; prompt: string; placeholder?: string; initial?: string;
         confirmLabel: string; skipLabel?: string; skipTo?: "profile" | "dismiss" }
     | { kind: "select"; prompt: string; options: {value:string;label:string}[];
         confirmLabel: string; skipLabel?: string }
     | { kind: "confirm"; prompt: string; confirmLabel: string; cancelLabel: string;
         tone?: "default" | "danger" };
   ```
   只负责 UI + 触控热区 + 折叠动画；无业务逻辑。

2. **`SideState` / `IntroState`（左侧 Agent 状态机）**
   在两个 canvas 的 state 里各加：
   ```ts
   pendingAsk?: { id: string; ask: AgentAsk; resolve: (v: string | null) => Action }
   ```
   或者更简单：在 `SideMsg` 里加可选 `ask` 字段，Agent 消息可直接携带一次 ask；`ChipRow` 位置根据 `msg.ask` 或 `msg.chips` 二选一渲染。

3. **改造现有跳转与提示为 ask**
   - `src/routes/side-by-side.tsx:208-220`：城市缺失不再 `navigate`，改为 push 一条带 `kind:"text"` ask 的 Agent 消息。用户提交后 `saveProfile({city})` 并 replay 原本要做的动作。
   - `src/components/canvas/intro-canvas.tsx:181-190`：Say hello 缺 name / city 同上。
   - `refineWhen` / `refineLevel` 当前用的是 chips，保留，不改。
   - `revokeAndReset` 前插一次 `kind:"confirm"` ask。
   - Start chat 前，若 Agent 有 `pendingDraft`，改为 `kind:"text"` ask 让用户确认或修改草稿再发送。

4. **多语言**
   `en/zh` 新增一组通用 key：`ask.city.prompt/placeholder`、`ask.level.prompt/options.*`、`ask.confirm_revoke.*`、`ask.confirm_send.*`、`ask.trait.prompt`、共 ~10 条；同时清理 `awaitingTrait` 相关旧文案里已不再使用的引导句。

5. **验证**
   - 375 宽 mobile 视口下依次触发：发心愿缺城市 / Say hello 缺 name / 撤回确认 / 编辑开场白，四种 ask 都能在流内完成、TabBar 不遮挡、键盘正常。
   - 桌面端 976 宽视口同上。

## 明确不做

- 不把 bio / MBTI / 性别做成 ask —— 那些不阻塞任何流程，用户自己去 Profile 编辑就好。
- 不改右侧候选卡 / 详情页 UI。
- 不引入真正的 LLM 或后端；ask 仍由前端规则触发，与当前的 seed / 匹配逻辑衔接。
- 不动 `/profile`、邀请码、登录流。

## 需要你拍板

我按上面这版直接落地，一次只问一件事、内嵌卡片形态、四类触发场景（缺城市 / 缺水平 / 撤回确认 / 开场白确认）。**如果你希望把 Save for later 之后的"要不要顺便说下希望 TA 是怎样的人"也做成 ask**（会稍微增加提问频率），告诉我，我加进去；否则默认不打扰。
