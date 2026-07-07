## 定案：Side by Side = 基于"事"的搭讪入口

产品终点是**两个人在 connections 里开始聊**，不是"完成一次约"。之后敲时间、去哪、见不见，走用户已经在用的对话线程。Side by Side 只负责**把两个陌生人放到同一个话题里**，然后交棒。

## 三步产品（起 / 中 / 结）

```
[起 · 说]              [中 · 看]                [结 · 招呼]
一屏两段选择             一张匿名候选卡              一键 say hello
                                                  → 进 /connections
"你这周想做什么          "TA 周六上午也要去          "打个招呼"
 什么时候？"             Riverside 打网球"          → 以这件事为
                                                    开场白的一条
                        [ 打个招呼 ] [ 换一个 ]     hello 已发出
```

**Step 1 · 起**  
一屏两段，不再有第三段：

```
这周你想做点什么，什么时候？

做什么   [🎾][🏃][🧗][🍳][🖼][📚]
何时     ○ 这个周末   ○ 工作日晚上   ○ 随便都行
                                          (点这行展开 21 格具体时段)
              [ 帮我找一个人 ]

  找到只是起点，聊起来才是。TA 拒绝也不会知道是你。
```

去掉：level（水平）、area（区域）、单独的 day + window 双字段。数据层保留 level 做匹配加权，用户不填。

**Step 2 · 中**  
一张卡，两个按钮，没别的：

```
┌────────────────────────────────────┐
│   🎾  周六上午 · Riverside          │
│   [?]  TA 周六上午也要去那儿打球     │
│                                     │
│   [ 打个招呼 ]      [ 换一个 ]      │
└────────────────────────────────────┘
```

- **打个招呼**：调用现有 `connections.hello(personId, openerText)`，`openerText` 由系统自动生成一句以"这件事+这个时段"为主语的话（en/zh 各一套模板，用户不写）。然后 **直接 `navigate("/connections")`**，Side by Side 页任务结束。
- **换一个**：换下一个候选。无预算上限，池子看完了就一句"这个组合的都看过了"+ 一个"换个条件"按钮回 Step 1。

**无匹配时**：不再是三按钮面板。就一段话 + 一个按钮：

```
  这周你选的时段没人。
  周日上午有 2 个人也打网球。

              [ 试试周日上午 ]
              或 [ 换个条件 ]  ← 次要
```

top-1 near-miss 一键跳转；没有近邻时只显示"换个条件"。

**Step 3 · 结**  
**没有 Step 3**。用户已经在 `/connections` 里那条 thread 上，之后 TA 回不回、约几点、去不去，全部走 Matchmaker 的现成机制。Side by Side 页面回到 Step 1 的空状态，本周还想再来一次就再来一次。

## 起中结的信号

- **起**：Step 1 表单可见 = 用户在告诉系统"我想干嘛"
- **中**：Step 2 匿名卡可见 = 系统给出一个选项让用户裁决
- **结**：点了"打个招呼"，路由跳到 `/connections`。**这就是终止信号**——Side by Side 的活干完了。

## 拆掉不做（相比上一版）

- ❌ Step 3 "正在问 TA" 全屏等待——不再需要。Side by Side 不管 TA 有没有同意，那是 connections 的事。
- ❌ Step 4 约定卡 / 加入日历 / 取消——不再需要。约定发生在 connections 的对话里。
- ❌ Step 5 24h 后 debrief——不再需要。两个人是不是要继续，看 connections thread 就够了。
- ❌ Header 徽章 "周六 · 网球"——不再需要。没有独立于 connections 的"约"了。
- ❌ `SideState` 里的 `phase = "proposed" | "awaiting_them" | "confirmed"`——退化成 `"gathering" | "reviewing"` 两个状态。
- ❌ `accept` / `decline` / `simulateThemReply`——通通删掉。
- ❌ 左侧对话框——`side-by-side.tsx` 从双栏改单栏，`Workspace` 换成一个薄的 `SoloShell`（Header + 中间内容）。
- ❌ level / area 字段。
- ❌ retry 额度。
- ❌ 匿名当天解锁机制——因为不再有"当天"这个概念，直接跳去 connections 后按现有匿名/揭示逻辑走（connections 里 hello 是有名字的，那就有名字，符合 Matchmaker 现状）。

## 留下

- `state.user`（UserActivity）——用户填的偏好，用来匹配和显示 recap。
- `findMatches` / `findNearMisses`——匹配算法保留，用户看不到多余选项。
- `hello()` in `connections.ts`——直接复用。
- `PEOPLE` 数据 + activity 字段——保留，级别当加权。

## 技术改动清单

**改**
- `src/routes/side-by-side.tsx`：不再用 `Workspace`。改用一个新的 `SoloShell`（Header + 中间容器，无对话框）。删除所有 `send/messages/composerDisabled/thinking` 相关逻辑，只留 `state` + 4 个 handler：`handleSetActivity` / `handleSwap` / `handleSayHello` / `handleAdjust`。
- `src/components/canvas/meet-canvas.tsx`：完全重写为三个视图 `<FormView>` / `<PickView>` / `<EmptyView>`，按 `state.phase` + 是否有 near-miss 切换。删除所有 accept/decline/awaiting/confirmed 相关分支。
- `src/lib/agents/side-by-side.ts`：
  - `SideState` 简化：`{ user?: UserActivity; candidate?: { personId; slot; reason }; skipped: string[]; nearMisses: NearMiss[] }`。删除 `phase`（改用派生态）、`messages`、`proposal`、`confirmedAt` 等。
  - 新增 `sayHello(state, lang): { nextState, personId, opener }`——生成 opener 文案，把 candidate 加入 skipped，返回让路由跳 `/connections`。
  - 保留并微调 `findMatches` / `findNearMisses` / `switchKind` / `addSlot`。
  - 删除 `accept` / `decline` / `simulateThemReply` / `L.*` 里大量不再出现的台词。
- `src/lib/connections.ts`：`hello()` 接受 `opener?: string` 参数（现在应该已经有 opener 文本参数，若无则加）。
- `src/components/home.tsx`（如涉及 Side by Side chip 文案）：把长句改成简单一句，比如"和一个人做点什么"→ 保持现状即可。

**新增**
- `src/components/solo-shell.tsx`（或直接内联在 side-by-side.tsx 里，一个 20 行的组件）：单栏容器 + 复用现有 `WorkspaceHeader`。

**删除的文件**（如存在）
- `src/components/canvas/sent-waiting.tsx` — 上一版加的 Step 3 等待态组件，不再需要。**保留判断**：如果 Matchmaker 侧也在用它，就不删；只是 Side by Side 不再引用。

**locales**（en + zh-CN）
- 新增：`meet.hero_prompt`（起点大标题）、`meet.when_group.{weekend,weeknight,any}`、`meet.pick_specific_slot`、`meet.reason_template.{tennis,running,climbing,cook,gallery,books}`（用于自动 opener）、`meet.say_hello`、`meet.swap`、`meet.no_slot_hint`、`meet.no_slot_fallback`、`meet.adjust`、`meet.pool_exhausted`。
- 删除：`meet.form_area*`、`meet.composer_placeholder`、`meet.confirmed_*`、`meet.awaiting_*`、`meet.accept`、`meet.decline`、`meet.near_add_slot`、`meet.near_other_kind`、`meet.near_switch_kind`、`meet.recap_label`、`meet.adjust_pref_*`、`agents.sidebyside.*` 里所有面向"等 TA / 已定"的台词。

**opener 模板举例**  
系统点击"打个招呼"时用 `state.user.kind` + `candidate.slot` + `candidate.reason` 拼一句：
- zh：`看到你也在周六上午打网球，我也常去 Riverside。要不要一起？`
- en：`Saw you play tennis Saturday mornings too — I go to Riverside a lot. Want to hit together?`  
6 个 kind × 一个模板即可，不做花活。用户可以进 connections 后自己改（现有 hello composer 应该已经支持）。

## 验收

1. 进 `/side-by-side` 是单栏，无左对话框；一屏内看到"做什么 + 何时 + CTA"。
2. 提交冷组合 → 一段话 + 一个"试试周日上午"按钮 + 一个次要"换个条件"。
3. 提交能匹配的组合 → 一张匿名卡 + 两个按钮。
4. 点"打个招呼" → 立即跳到 `/connections`，能看到一条新 thread，opener 是那句拼好的话。
5. 点"换一个" → 卡换人；池子耗尽后按钮消失，出现"这个组合都看过了"+ 一个"换个条件"。
6. `SideState` 里没有 `phase = "confirmed" | "awaiting_them" | "proposed"` 相关代码路径。
7. `tsgo --noEmit` 通过。

## 为什么这是"够简"的止点

再往下砍就伤到目的了：
- 砍掉 Step 2 的"换一个" → 用户只能盲选一个人，接受度会掉
- 砍掉无匹配的 near-miss 建议 → 又回到"死圆圈"
- 砍掉时段字段只留活动 → 匹配没有意义

再往上加就重回混乱：
- 加回等待态 → 引入独立于 connections 的时间线，用户要在两个地方看进度
- 加回约定卡 / 日历 → 让 Side by Side 抢 connections 的活
- 加回 debrief → 又要维护一个只此一处的状态机

这一版：**Side by Side 只做"把两个人放到一个话题下"这一件事**，然后把接力棒交给 connections。产品自洽，用户学一次（在 connections 聊天）就能同时用两个入口。
