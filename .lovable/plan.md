## 卡点还原

用户到 `/side-by-side` → 填完表单（比如"网球 · 中级 · 周六上午 · Riverside"）→ 提交 → 系统在 `PEOPLE` 里没找到同时满足**同活动 + 同时段 + 水平差 ≤1**的人 → 右边只剩一个虚线圆圈 + "我继续盯着"，左边同一句话。**用户没有任何下一步**。

这一步要解决的问题不是"补一个功能"，是**在没匹配到的时候，让用户依然能推进**。

## 设计原则

1. **说清为什么**：不是"没人"，而是"没人在你选的那一格"。
2. **给出可动作的邻近格**：告诉用户"如果你愿意挪一格，就有人"。
3. **允许即时改条件**：不用回上一步、不用重填表单，就地调偏好。
4. **保留原承诺**：即使有 near-miss，也**不**破坏"每周一次真实约"的调性——邻近格只是让用户**修改自己的可约时段**，而不是降低匹配标准。
5. **对话框保持讲述层**：所有操作都在右边（跟 Matchmaker 的分工一致）。

## 一、新增 `findNearMisses` — 给出"差一格"的候选

`src/lib/agents/side-by-side.ts` 加一个函数：

```ts
export interface NearMiss {
  kind: "other_slot" | "other_activity_here" | "other_area";
  personCount: number;      // 有几个人在这个邻近格，不暴露是谁
  hint: {                    // 用户要挪的那一格
    kind?: ActivityKind;     // 换活动
    slot?: { day; window };  // 换时段
  };
  label_en: string;
  label_zh: string;
}

export function findNearMisses(state: SideState): NearMiss[]
```

规则（在 `PEOPLE` 里聚合，全部匿名，只回人数）：
- **同活动，不同时段**：用户是 `tennis/sat-morning`，找出 `tennis/*` 的所有 (day, window) 组合，去掉用户已经选过的，按人数排序取 top 3。文案："周日上午还有 2 个人打网球" / "工作日晚上也有 1 个"。
- **同活动，不同区域**：用户填了 area 但 PEOPLE 的 activity.area 不同，如果同活动同时段有人但**只**是区域不同，独立提示。文案："同一时段，Downtown 有 1 个人在打网球"。
- **同时段，不同活动**：如果用户周六上午本来也做别的（不假设，只提示可能性）。文案："周六上午做别的事的话，还有 3 个人"。

`kind: "other_slot"` 的 hint 里带具体的 (day, window)，点击时**加入**到 `state.user.slots`（不是替换，用户仍然保留原时段）。这一步很关键——用户不是"改主意"，是"多开一扇门"。

## 二、右侧 waiting pane：从"死圆圈"变成"邻近格面板"

改 `src/components/canvas/meet-canvas.tsx`，当 `state.phase === "waiting" && state.user` 时（表单已提交但没约）：

```
┌────────────────────────────────────────┐
│ 你的时段                                │
│  🎾  网球 · 中级 · 周六上午 · Riverside │
│                                        │
│ 这一格本周没人。差一点就有：              │
│                                        │
│ ┌────────────────────────────────────┐ │
│ │ 周日上午 · 2 个人也打网球            │ │
│ │ [ 加上这个时段 ]                    │ │
│ └────────────────────────────────────┘ │
│ ┌────────────────────────────────────┐ │
│ │ 工作日晚上 · 1 个人也打网球          │ │
│ │ [ 加上这个时段 ]                    │ │
│ └────────────────────────────────────┘ │
│                                        │
│ ─────── 或者 ────────                   │
│                                        │
│ [ 调整偏好 ]                            │
│                                        │
│ 没有合适的也没关系。有人出现我立刻告诉你。│
└────────────────────────────────────────┘
```

要点：
- 顶部一栏灰底 recap：**用户当前的偏好**（活动/水平/时段/区域），一眼看到自己填了啥。
- 中间：**最多 3 张** near-miss 卡片，每张只说人数，绝不暴露是谁。按钮明写「加上这个时段」（不是"改成"，是"追加"）。
- 底部：「调整偏好」——点了展开原 `ActivityForm`（复用组件，预填当前值），改完提交调用新的 `updateUserActivity(state, user, lang)`，它 = `setUserActivity` 但不会 `pushA` 那句 "Saved."，改成 "调整了。再看看。"（新台词）。
- 最后一句安抚文本保留（"有人出现我立刻告诉你"），但不再是唯一的东西。
- **没有 near-miss 可推**（真的全空）时：中间那块换成一段解释文案 "网球在你的城市这周确实没人。如果你愿意换个活动试试——" + 直接给一排 chip：其它 6 种 ActivityKind，点了直接改 `state.user.kind` 并重跑匹配。

## 三、Agent 台词跟着变

`src/lib/agents/side-by-side.ts` 里 `L.no_match` 目前是一句死话。改成动态：
- **有 near-miss**：`"这一格本周没人。差一点就有——右边看看邻近的几个时段。"` / `"Nobody in this exact slot this week. Close ones on the right — take a look."`
- **完全没有**：`"你选的活动这周整个城市都没人。要不换个试试？右边可以直接切。"` / 类似英文。
- 用户点「加上这个时段」后：Agent 说 `"记下了。加上周日上午一起看。"` 然后重跑 `tryPropose`——如果这次匹配到，直接进 proposed。

## 四、左侧对话框：**保持不动**

对话框仍然是禁用状态（`composerDisabled` 逻辑不变）。用户不用打字，所有操作在右边。这是刻意的——Side by Side 的操作面就在右侧卡上，跟 Matchmaker 的操作在 IntroCanvas 卡上一样，学一次就够。

## 五、Header：轻微的"进展感"

Header 现在只有 Connections 徽章。加一枚极小的状态芝麻点：如果 `sideBySideState.phase === "waiting" && state.user`（等着约），Side by Side 的 tab 或 chip 上加一个 mono 小字 "watching"。**不闪、不红点**——就是让用户知道系统还在替他看。（可选，如果嫌花，可以先不做。）

---

## 技术细节

**新文件**
- 无。所有变更在现有文件里。

**改动**
- `src/lib/agents/side-by-side.ts`：
  - 加 `findNearMisses(state): NearMiss[]`。
  - 加 `addSlot(state, slot, lang): SideState`（追加 slot 到 `user.slots` 后调 `tryPropose`）。
  - 加 `switchKind(state, kind, lang): SideState`（改 `user.kind` 后调 `tryPropose`）。
  - 加 `updateUserActivity(state, user, lang): SideState`（编辑现有 user，不重来）。
  - `L.no_match` 拆成 `L.no_match_with_near` / `L.no_match_empty`，`tryPropose` 根据是否有 near-miss 选一个。
- `src/components/canvas/meet-canvas.tsx`：
  - `phase === "waiting" && state.user` 分支渲染新的 `WaitingPane` 内部组件（recap + near-miss 卡片 + 调整偏好 + activity chip 换）。
  - `ActivityForm` 抽出成能接受 `initial` 的组件（用于「调整偏好」）。
- `src/routes/side-by-side.tsx`：加 `handleAddSlot` / `handleSwitchKind` / `handleUpdateActivity` 三个 wrapper。
- `src/locales/*/common.json`：新增文案 `meet.recap_title` / `meet.near_title` / `meet.near_empty_title` / `meet.near_add_slot` / `meet.adjust` / `meet.try_other_kind` + agent 台词两条。

**不做**
- 不引入通知/邮件/推送——"我盯着"仍然是本地承诺。
- 不做跨活动的智能推荐（"跑步的人可能也喜欢网球"），太啰嗦。
- 不做匹配质量降级（把 level 差从 ≤1 放宽到 ≤2）——匹配严格性是产品承诺。
- 不改 confirmed / 日历 / plans 归档等更后段的事，先把这一步跑通再说。

## 验收

1. 填完一个偏冷的组合（比如"攀岩 · 周三 · 中午"）→ 右边不再是空转圈，而是 recap + 邻近格卡片（如果种子数据里有邻近人）。
2. 点「加上周日上午」→ 右边直接变成 proposed 状态（或者再次 waiting 但多了一格 recap），流程能跑下去。
3. 填一个真没人的组合 → 右边显示"换个活动试试"+ 6 个活动 chip，点一下立刻重新匹配。
4. 点「调整偏好」→ 表单展开、预填、改完提交 → recap 更新、near-miss 重算。
5. 左侧对话框始终是禁用讲述，用户不用打字。
6. Agent 那句话跟着状态变（有 near / 完全空 / 加了 slot / 换了活动），不是永远一句死话。

## 之后的路（本轮不做，仅备忘）

跑通 waiting → proposed 之后再回来做：`confirmed` 变约定卡、`.ics` 下载、`/connections?tab=plans` 归档。跳过这一步直接做后面等于给一个跑不到终点的通道装终点线。
