## 我的判断（先说结论）

你的直觉是对的，当前 Saved 有两个真问题：

1. **位置错了**：它浮在右侧匹配画布右上角，是「页面内控件」而不是「一个我能随时回来的地方」。视觉像小徽章，心智却承担"收藏夹"角色，错位。
2. **生命周期错了**：一开始聊天就清空整份 Saved，用户会觉得东西丢了。收藏本来就是"我以后再看"，不该被"和某一个人开始聊"这个动作牵连。

我的方案是：**把 Saved 提升为全局对象**，跨 session、跨页面存在；匹配卡只保留"加入/移出"按钮，入口统一放到顶部 Header。

我明确不做的事：不做永久收藏夹、不做分组/标签/搜索、不跨到 Matchmaker。它只服务一个场景——"这个人可以，但我想先看下一个，之后回来找 TA"。加任何东西都会让它变重。

---

## 产品设计

### 1. 匹配卡：只承担决策，不承担入口

底部三个动作并列，含义完全独立：

```text
[开始聊]   [♡ 收藏 / ✓ 已收藏]   [看下一个 →]
```

- 收藏 = 纯 toggle，把当前 TA 放进/移出全局 Saved，不换人、不重匹配。
- 看下一个 = 只换人，不影响收藏。
- 删除右上角浮动的 Saved pill。匹配卡回归"看一个人、做一个决定"的干净状态。

### 2. Header：新增全局 Saved 入口

顶部 Header（History 旁）加一个轻量入口：

```text
♡ Saved · 2
```

- 计数 > 0 才显示，不占用首页视觉。
- 在 do something 页、聊天页、History、Profile 等所有 Workspace 页面都可见。
- 点击打开右侧抽屉。
- 首页不再加 Banner/卡片——用户想找收藏就上顶部，一个地方，永远在。

### 3. Saved 抽屉：极简列表

每条只显示最有用的四件事：

- 头像 + 名字 + 城市/职业
- TA 当时发布的原话
- 当初是从哪条心愿收藏的（如"来自：周末网球"）
- 两个动作：`开始聊` / `移出`

不做筛选、不做排序、不做搜索。

### 4. 生命周期：不再被"开始聊"清空

新规则更符合直觉：

- **开始聊 TA**：只把 TA 一个人从 Saved 移出。
- **撤回心愿**：只移出这条心愿关联的收藏。
- **回首页/切页面/关抽屉**：Saved 完全不动。
- **手动"移出"**：显式操作，彻底清一个。

### 5. No Match 场景闭环

池子空了时，如果还有 Saved：

```text
暂时没有新的人了。你先前收藏了 2 位，可以回去看看，也可以放宽心愿。
```

不再另做独立入口，就一句提示 + 复用顶部 Saved。

---

## 用户完整流程

```text
匹配卡看到 A       → 觉得可能可以 → 点♡收藏 → 顶部 Saved 变 1
点看下一个 → 卡 B  → 不合适       → 跳过
点看下一个 → 卡 C  → 决定就是 TA  → 点开始聊
                                  → C 从 Saved 移出，A 仍在
聊到一半退出到首页 → 顶部依然看到 Saved · 1
过两天回来点开    → 抽屉里 A 还在，可直接开聊或移出
```

任何时候用户都知道去哪找收藏：**顶部**，一次也不会因为切页面/开始聊而丢。

---

## 技术改动

- 新建 `src/lib/saved-intents.ts`：全局 localStorage store，字段 `{ intentId, sessionId, savedAt }`；提供 list/toggle/remove/subscribe。
- 新建 `src/components/saved-trigger.tsx`：Header 入口按钮 + 抽屉（复用 shadcn Sheet）。抽屉内容用 `getIntentById` + `getSession` 拼装。
- `src/components/workspace-header.tsx`：在 History 旁挂 `<SavedTrigger />`。
- `src/lib/agents/side-by-side.ts`：
  - `saveCurrent` 改为写入全局 store；`state.savedIntentIds` 保留但读取以全局为准。
  - `startChat` 不再清空 `savedIntentIds`，改为只从全局 Saved 移除当前 `matchIntentId`。
  - `revokeAndReset` 只清理关联该 `myIntentId` 的 Saved 记录。
- `src/components/canvas/meet-canvas.tsx`：删除右上角浮动 pill；删除 NoMatch 内独立收藏卡；匹配卡底部保留 Save toggle 并读全局状态。
- 文案：更新 `intent.narrate_saved` / `intent.saved_hint`，去掉"开始聊会清空"的旧暗示。

---

## 请你确认一件事

Saved 是否也要在 Matchmaker（介绍一个人）复用？

**我建议不共用。** Matchmaker 是"一次一个人、带理由"的引荐流，本来不鼓励收集；共用会把它拉向收藏夹方向，反而变重。Saved 只服务 Do Something。

同意这个边界我就按上面做；若你希望是跨 Agent 全局收藏夹，请说，那第 2、3 步会改。