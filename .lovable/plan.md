# Introduce someone 详情页 —— Action 清晰化 + Save 闭环

## 目标（用户视角）

看完一个人后，只面对两个明确的选择：
1. **主动 → Say hello**（写招呼、开始连接）
2. **暂缓 → Save**（先收着，之后再决定）

「换一个」不再是一个"决定"，而是一个隐性动作（跳过=看下一位），不与前两者争夺注意力。取消模糊的 Pass。

## 变更

### 1. 按钮布局：Say hello / Save 并列

`src/components/canvas/intro-canvas.tsx` 里 `!conn && !composing` 分支：

- 现状：`Say hello`（主）+ `Pass`（弱链接）+ 上方独立的 `Another person`（弱链接）
- 改为：**`Say hello`（主，深底）** 与 **`Save`（次，描边）** 并列同权重
- `Another person` 保留但**下沉为一行文字型链接**放在两个按钮下方，配文案「看下一位」——它是"跳过"，不是"决定"

```text
[ Say hello ]   [ ♡ Save ]
                              ← 一段小字提示
                              ↓
       See someone else →     ← 弱链接
```

### 2. Pass 语义正式退休

- 删除 `t("connection.pass")` 在此处的使用（键可保留以防他处引用）
- `onPass` prop 保留签名但改为触发 Save 逻辑，或直接新增 `onSave`，并把 `matchmaker.tsx` 中 `onPass={() => trigger(actAnotherPerson)}` 替换为 `onSave={handleSave}`

关键区别：
- 旧 Pass：把该人加入 `passedIds`（**永久排除，再也不会推**）
- 新 Save：**不进 passedIds**，加入"收藏人"列表，同时前进到下一位

### 3. Save 存储 —— 新增 saved-people 模块

新建 `src/lib/saved-people.ts`（对照 `saved-intents.ts` 的结构，独立 key）：

```ts
interface SavedPersonRecord {
  personId: string;
  sessionId: string;      // 来自哪个 matchmaker 会话
  savedAt: number;
}
// listSavedPeople / isPersonSaved / savePerson / removeSavedPerson
// / toggleSavedPerson / subscribeSavedPeople
// localStorage key: "kindred:saved-people:v1"
```

行为：
- Save 按钮点击 → `savePerson(personId, sessionId)` → 调用 `onAnotherPerson` 前进
- 若该人已 saved，按钮显示为 `Saved ✓`，点击后取消收藏（不前进）

### 4. Header 收藏入口扩展

`src/components/saved-trigger.tsx` 目前只列 Intent。改为**同一 Sheet 内两个分区**：

```
Saved
├─ People you kept              (来自 Introduce someone)
│    · Avatar · Name, age · City · occupation
│    · "why they might fit" 一句
│    · [ Say hello ]  [ Remove ]
└─ Wishes you kept              (来自 Side by Side，现有)
```

- 空态：两区均空时按钮隐藏（沿用现有 `count === 0` 隐藏规则，count = people + intents）
- People 项的 `Say hello` → 跳 `/matchmaker?session={rec.sessionId}` 并通过 `sessionStorage` 写入 focus-person 指令，`matchmaker.tsx` 现有 `consumeFocusPerson()` 已能承接，无需改路由

### 5. Introduce 卡片本身对 saved 状态感知

- 若当前 person 已在 saved-people 里，Save 按钮变 `Saved ✓`（描边+对勾）
- Sent/Connected/Faded 各态下（`conn` 存在时），若之前 saved 过，静默从 saved-people 移除——已建立连接，收藏收纳意义结束

### 6. i18n（en / zh-CN）

新增/调整键：
- `connection.save` = "Save" / "先收着"
- `connection.saved` = "Saved" / "已收藏"
- `connection.save_hint` = "Keep them for later. You can come back from the header." / "先收着，之后可从顶部「已收藏」再找回。"
- `intro.see_someone_else` = "See someone else →" / "看下一位 →"
- `saved.section_people` = "People" / "人"
- `saved.section_wishes` = "Wishes" / "心愿"
- `saved.people_empty` / `saved.wishes_empty` 分区空态

废弃（不删键，仅停止使用）：`connection.pass`、`intro.another_person`（顶部次按钮位置移除）

## 交互闭环示意

```text
Introduce ──Say hello──▶ Composer ─▶ Sent/Connected ─▶ Connections
     │
     ├──Save──▶ (前进到下一位) ─────┐
     │                              │
     └──See someone else──▶ 下一位  │
                                    ▼
                        Header · Saved · People
                                    │
                                    └──Say hello──▶ 回到该人的 Introduce
```

Save 明确的"下一步"就是：**从 header 找回 → Say hello**。这是唯一的续接路径，简单闭环。

## 技术要点

- `saved-people.ts` 结构对齐 `saved-intents.ts`，两者都通过各自 `subscribeXxx` 通知 header 更新
- `SavedTrigger` 用 `useSyncExternalStore` 订阅两个源；count = 两者相加
- 不新增路由；focus person 复用现有 `consumeFocusPerson` + `?session=` 机制
- 不改 `matchmaker.ts` 状态机；Save 与 pass 的差异只在于**不写入 `passedIds`**，因此该人未来仍可能被算法推荐——符合"暂缓不是拒绝"

## 不做的事

- 不给 Save 增加标签/备注/文件夹分类（保持简洁）
- 不为 Save 加通知或提醒回访（避免打扰）
- 不改 Composer、Connections、Faded 三个已有分支的按钮结构
