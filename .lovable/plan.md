## 目标

1. 点「去看进展」→ 直接落到该人的对话（或等待页），并高亮「你最后一句」与「TA 最新回复」。
2. 从对话返回时，回到刚才那张 Matchmaker 卡片，草稿/滚动/所选此人都不丢。

---

## 一、`?open=<personId>` 直达

- `src/routes/connections.tsx`
  - 用 `validateSearch` (zod + fallback) 声明 `{ open?: string }`。
  - 首次 items 加载后，如果 `open` 命中且状态是 `incoming | connected | sent`，`setActiveId(open)`，然后 `navigate({ search: {}, replace: true })` 清 URL，避免刷新反复触发。
  - 记录 `activeId` 到 `sessionStorage["kindred:connections:last"]`；无 `?open` 时优先恢复上次的 active（仍存在的话）。

- `src/components/canvas/intro-canvas.tsx`
  - `sent` 分支的「去看进展」和 `connected` 分支的「进入对话」 `<Link>` 加 `search={{ open: person.id }}`。

## 二、Sent 也有落点：Waiting Pane

`sent` 目前在右侧没有 pane。新增 `src/components/canvas/sent-waiting.tsx`：

- 顶栏：「← 回到 XX 的介绍」按钮（`setFocusPerson` + `navigate("/matchmaker")`）。
- 内容：头像 + 名字 + 「在等 XX 的回音」+ 复用 `YourHelloRecap` 展示 hello 内容 + 一段安抚文本。

`connections.tsx` 的 `paneKind` 加一档 `waiting`：`sent` → 渲染 `SentWaitingPane`。侧栏 sent 行的行为改为「设置 activeId（打开右侧 waiting pane）」，而不是直接跳回 Matchmaker——原来那条跳转路径由 waiting pane 顶栏的按钮承担，更符合用户预期。

## 三、Thread 高亮 + 返回按钮

改 `src/components/canvas/connection-thread.tsx`：

- 顶栏左侧加「← 回到 XX 的介绍」按钮：`setFocusPerson(personId)` + `navigate({ to: "/matchmaker" })`。
- 用 `useMemo` 算 `lastMineIdx` / `lastTheirsIdx`。渲染时给两条气泡外层套一个小容器：
  - 上方一行 mono 小标签：`你最后说` / `TA 刚回`。
  - 气泡加 `ring-1 ring-foreground/25` 轻微强调，不改现有配色。
- 首次进入若有 `lastTheirsIdx`，用 `messageRefs[lastTheirsIdx]?.scrollIntoView({ block: "center" })` 定位；否则维持现有 scroll-to-bottom。

`IncomingHello` 顶栏也加同样的「← 回到 XX 的介绍」按钮，保证任意右侧 pane 都能一键返回。

## 四、Matchmaker 端接住返回

- Matchmaker 页在挂载时已 `consumeFocusPerson` → `focusPerson(state, id)`，卡片直接切到该人。
- Intro Canvas 里的 per-person `sessionStorage` 草稿逻辑已存在，返回后 composer/picked/reply 自动还原——无需改动。
- 只需确认：`focusPerson` 也在「Matchmaker 已 hydrate 状态下再次到达」时被消费；当前实现是从 `useState` 初始化里读，OK。

## 五、i18n 新增

`connection`（en/zh 各加）：

- `back_to_intro`: "Back to {{name}}" / "回到 {{name}} 的介绍"
- `waiting_title`: "Waiting on {{name}}" / "在等 {{name}} 的回音"
- `waiting_hint`: 一句安抚 / "TA 一回来这里就会亮起。你可以继续看别人。"
- `your_last`: "Your last message" / "你最后说"
- `their_reply`: "Their latest reply" / "TA 刚回"

## 明确不做

- 不做 websocket / 实时推送（继续复用 header 轮询红点）。
- 不改 sayHello / 解决规则 / Agent 对话逻辑。
- 不做已读回执、消息编辑撤回。

## 验收

1. `sent` 卡片点「去看进展」→ 直达 /connections，右侧就是这个人的 waiting pane。
2. `connected` 卡片点「进入对话」→ 直达该人对话；自动滚到「TA 刚回」那条，你的最后一句也有明显标记。
3. 对话/waiting/incoming 顶部都有「← 回到 XX 的介绍」按钮，一键回 Matchmaker，卡片仍是该人、composer 草稿仍在。
4. 从其他入口再进 /connections（不带 `?open`），恢复上次看的那个人 pane，不会被自动选择打乱。
5. 侧栏「等回音」不再直接跳走，而是打开 waiting pane；waiting pane 顶栏按钮才回到 Matchmaker——路径统一。
