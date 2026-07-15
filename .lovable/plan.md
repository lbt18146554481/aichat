## 判断

首页那张 "someone lined up with you / waiting…" 卡片确实是多余的：

- 首页的职责是**开始一段新对话**（问候语 + 输入框 + 两个 chip），塞一张状态卡片会把注意力从"想说什么"拉走。
- 它展示的所有信息（等待中 / 匹配到了 / 聊天中），点开 History 里对应那条记录就能看到，本来就是一条路径。
- 它还会引发歧义：用户以为首页会自己刷新出匹配，实际上 rematch 只在挂载那一刻跑一次，容易觉得"产品有点鬼"。

所以拆掉它，让首页回到最干净的样子。同时把"没匹配到"这个尴尬状态的闭环，收进 `/side-by-side` 页面本身，让 History 成为唯一"回到未完成事情"的入口。

## 产品流程（改后）

```text
首页 ─(输入 + 一起做点什么)─▶ /side-by-side?session=xxx
                                        │
                    ┌───────────────────┼───────────────────┐
                    ▼                   ▼                   ▼
                匹配到               没匹配到              点开聊天
              (match 卡)         (nomatch 卡)            (chat 视图)
                    │                   │                   │
                    │        ┌──────────┼──────────┐        │
                    │        ▼          ▼          ▼        │
                    │     调整心愿   试试近似人  先保存着     │
                    │    (when/level) (near-miss)  ▼        │
                    │        │          │      回到首页      │
                    │        └────┬─────┘   (session 留在    │
                    │             ▼          History，状态    │
                    └──▶  History 一行 ◀──── 是"等待中")    ◀┘
```

关键点：**History 那一行本身就是"这件事还没完"的载体**。用户点回来时，页面挂载会自动 rematch 一次——如果这段时间有新人进来，直接跳到 match 视图；没有就继续 nomatch。这个"回来一看有没有新人"的动作从首页 banner 挪到了 History 的点击行为里，语义反而更顺——是用户"主动去看"，不是首页替他"操心"。

## 改动

### 1. `src/components/home.tsx`
- 删掉 `<ActiveWishBanner />` 的渲染和它的 import。
- 顺手删掉页面里其它已经用不到的 import（如果有）。
- 其余布局不动。

### 2. `src/components/active-wish-banner.tsx`
- 整个文件删除。它不再被任何地方引用。

### 3. `/side-by-side` 的 nomatch 视图（`src/components/canvas/*` 里对应的卡片）
只做一个小的收尾，让闭环显式：

- 保留现有的两条路径：**调整心愿**（when / level chips）、**试试近似人**（near-miss）。
- 补一个次要按钮 **"先保存着"**：点了就 `navigate({ to: "/" })`，session 不 revoke，状态留在 History。
- 文案上把"我们还在替你留意"这类"后台在跑"的暗示去掉，改成明确的"目前没有匹配的人。你可以调整心愿、试试相近的人，或者先放着以后再看。"——不再暗示产品会主动通知。

（如果现有 nomatch 卡已经有这三个动作，就只调文案；不新增视觉层次。）

### 4. History 行为
不改代码，只是**在心里确认**这条链路已经成立：

- `/side-by-side` 页面挂载时，`load(sessionId)` 恢复 state → 如果 `stage === "published" && !matchIntentId`，`useEffect` 里跑一次 `findMatch`（这段逻辑目前在 `ActiveWishBanner` 里，需要**搬到 `/side-by-side` 的 mount effect**，如果那边还没有的话）。
- 这样"从 History 点回来 = 顺便再看看有没有新人"的语义就闭合了。

（这条如果 side-by-side 页面已经在做 rematch 就跳过；否则加一段 12 行左右的 effect。）

## 不做的事

- 不动 `sessions.ts` 的 status 字段——History 列表已经不显示状态胶囊了，但底层字段留着不清理。
- 不动 i18n key（`home.banner.*` 保留不删，避免顺手改乱）。
- 不动 matchmaker 侧的任何东西。
- 不加"通知"/"提醒"这类能让人误以为有推送的功能——这是 demo，不承诺后台行为。

## 验收

- 首页：只有问候语、输入框、两个 chip、页脚一行小字。没有任何状态卡片。
- 提交一个"一起做点什么"、没匹配到 → 落到 nomatch 卡 → 三个动作齐全：调整、试近似、先保存着。
- 点"先保存着"回到首页，首页干净；打开 History，那条 session 还在，点回去能继续。
- 如果这期间池子里出现了匹配（demo 里可以通过手动跑 seed 触发），点 History 回去时页面直接进入 match 视图。
