## 设计原则

- 收藏只是**延迟决策的临时书签**，不是关系管理工具。
- **只在当前心愿（session）内有效**：心愿撤回或找到聊天对象则清空。收藏与 History 不重叠，各司其职（History = 心愿维度，收藏 = 候选人维度）。
- 不新增页面、不新增全局入口、不出现在首页。所有操作都在 Side-by-Side 右侧画布内完成。

## 用户流程

```text
匹配卡 ──[♡ 收藏]──▶ 收藏成功（卡片替换为下一位候选）
   │                        │
   │                        ▼
   ├──[Start chat]        顶部出现 "已收藏 N 位" 小徽章
   ├──[See next]                 │
   └──[Withdraw]                 ▼
                          点击徽章 → 打开右侧抽屉
                                  │
                       ┌──────────┼──────────┐
                       ▼          ▼          ▼
                    再看资料    发起聊天    取消收藏
                    (打开 Profile Sheet)  (回到匹配池)
```

关键决策：
1. **♡ 收藏 = 软性 See next**：点击后当前候选进入“收藏”，画布自动展示下一位；不会再作为“主匹配”出现，避免重复打扰。
2. **收藏后能做什么**（帮用户决定）：
   - 再次查看资料（复用现有 Profile Sheet，无新 UI）。
   - 直接 Start chat（与主卡等价，聊天开启后本 session 收藏全部清空——已经进入沟通阶段，暂存池失去意义）。
   - 取消收藏（该候选人回到匹配池顶部，可再次成为主匹配）。
3. **匹配池耗尽时**：NoMatch 视图顶部显示“你还收藏了 N 位”，引导用户回看已收藏的人，形成闭环，避免“没人了”的死胡同。
4. **撤回心愿 / 编辑心愿并重匹**：收藏清空（候选前提已变），保持逻辑一致。

## UI 变化（都在 `meet-canvas.tsx`）

- MatchView 顶部操作区：`[Start chat] [♡ Save] [See next] [Withdraw]`。`♡ Save` 为次要按钮样式。
- MatchView 顶部右上角（仅当收藏 ≥1）：小徽章 `♡ 3` → 点击展开右侧“已收藏”抽屉。
- 抽屉内每行：头像 + 名字 + 一句 whyPersonLine + `[查看] [开始聊天] [取消收藏]`。
- NoMatchView：若有收藏，在池耗尽/等待区加一行“先回看你收藏的 N 位 →”按钮，打开同一抽屉。

## 技术改动

- `src/lib/agents/side-by-side.ts`
  - `SideState` 增加 `savedIntentIds: string[]`。
  - 新增 action：`saveCurrent(s)`、`unsave(s, intentId)`、`chatWithSaved(s, intentId)`。
  - `saveCurrent`：把当前 `matchIntentId` 推入 `savedIntentIds` 与 `triedIntentIds`，然后走 `skipMatch` 找下一位。
  - `unsave`：从 `savedIntentIds` 与 `triedIntentIds` 移除，再触发一次 `findMatch`（若当前无 match 则把它设为 match）。
  - `revokeAndReset` / `editWish` / `startChat` 内清空 `savedIntentIds`。
- `src/components/canvas/meet-canvas.tsx`
  - MatchView 加 `♡ Save` 按钮 + 收藏徽章。
  - 新增 `SavedDrawer`（复用 shadcn `Sheet`），列表项复用现有头像与 whyPersonLine 排版。
  - NoMatchView 显示 “已收藏 N 位” 入口。
- `src/routes/side-by-side.tsx`：把三个新 handler 透传给 `MeetCanvas`。
- `src/locales/{en,zh-CN}/common.json`：新增 `meet.save`、`meet.saved_count`、`meet.saved_title`、`meet.saved_empty`、`meet.unsave`、`meet.review_saved` 等文案。

## 不做

- 不做全局“收藏夹”页面（会与 History 职责重叠）。
- 不做跨 session 的持久收藏（收藏本质是当前心愿下的候选池，心愿变则失效）。
- 不给收藏加备注、标签、排序（复杂度收益比过低）。
