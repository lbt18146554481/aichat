## 诊断（已验证）

在预览里复现了你说的"See next 又不用了"：

- 当前会话的心愿是 `tennis / 任何时间 / 任何水平`，`triedOwnerIds = []`。
- 调用 `findAllMatches(mine, {})` 实际只返回 **1 个人**（June）。
- 因此 `MatchView` 里 `remaining = countAvailableMatches(排除 June)` = **0**，"看下一个"按钮被 `disabled`，鼠标悬停显示"池子里暂时没有别的人了"。

也就是说：按钮的代码逻辑是对的，但**种子池里同一个活动的候选人太少**，一旦出现第一个匹配，"看下一个"就立刻死掉，从用户视角看就是"按钮不能用"。这在跑步、攀岩等其它活动上也会同样发生。

再加一层问题：即便有多个同类候选人，我们目前对 `when` / `level` 是**硬过滤**的——只要用户勾了具体时间/水平，跨过一格立刻被剔除；这会让"看下一个"经常在第 2、3 次点击后就没人了。

## 目标

让"看下一个"变成一个**永远能推进**的动作，同时保持匹配质量的诚实标注：先给严格匹配，用完了自动降级到近似匹配，并明确告诉用户"这是近似的"。彻底禁用只作为最后手段。

## 方案

### 1. 扩充种子池，覆盖每个活动至少 3 人

`src/lib/people.ts` / `people-extras.ts` 里给现有活动补齐候选人，保证 `tennis / run / climb / cook / exhibition / bookstore` 每个 kind 至少 3 个不同的人，覆盖不同时间段和水平。这解决"根本没人"的根因。

### 2. 匹配引擎：严格→近似的自动降级

改造 `src/lib/intents.ts`：

- `findAllMatches(mine, opts)` 保持现在的"严格匹配"语义。
- 新增 `findRelaxedMatches(mine, opts)`：放开 `when` 或 `level` 之一（不同时都放）返回的候选人，并给每条打上 `relaxed: 'when' | 'level'` 标签。
- 新增 `pickNextCandidate(mine, opts)`：先看 `findAllMatches`；如果空了再退到 `findRelaxedMatches`；两者都空才返回 `null`。返回值除了 `Intent` 还带 `matchQuality: 'exact' | 'relaxed-when' | 'relaxed-level'`。

### 3. 状态机：`skipMatch` 用新的取候选人逻辑

`src/lib/agents/side-by-side.ts`：

- `rematchAfterUpdate` 和 `skipMatch` 内部改用 `pickNextCandidate`。
- `SideState` 增加 `matchQuality?: 'exact' | 'relaxed-when' | 'relaxed-level'` 字段。
- `countAvailableMatches` 计入 relaxed，作为按钮 `remaining` 的口径。

### 4. UI：诚实地展示"这是近似匹配"

`src/components/canvas/meet-canvas.tsx`：

- 顶部 "MATCH" 标签，当 `matchQuality !== 'exact'` 时改为 "CLOSE MATCH / 接近匹配"，并在 aligned 行末尾加一句解释（例如"时间没完全对上，TA 通常周日下午"）。
- 只有当严格 + 近似都为 0 才走 `NoMatchView`，此时才 `disabled` 看下一个。
- 移除"池子里暂时没有别的人了"这句悬停提示（当真到穷尽时按钮本来就消失/进入 NoMatchView，没必要再写）。

### 5. i18n

在 `src/locales/{en,zh-CN}/common.json` 加：

- `intent.match_label_close` — "CLOSE MATCH" / "接近匹配"
- `intent.close_reason_when` / `intent.close_reason_level` — 一句话解释

## 交付验证

- 用当前"我想找个人一起打网球"的会话，连续点"看下一个"至少能走完 3 位候选人，其中 1-2 位标为"接近匹配"。
- 严格匹配没走完前，标签仍是 "MATCH"。
- 全部人都试过后，进入 `NoMatchView`，而不是把 "See next" 挂在那里灰着。

## 技术细节

- 不改变 Save 的行为；`unsave` 里对 `triedOwnerIds` 的清理也保留。
- `pickNextCandidate` 一层薄壳，避免调用点各自拼装 exact/relaxed，防止未来遗漏。
- Relaxed 匹配只放开一个维度，同时放开会让"接近"变得毫无意义。
- 种子池扩充只加数据，不改 `Intent` 结构，无迁移问题。
