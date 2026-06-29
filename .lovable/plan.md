## 先想清楚：用户到底在解决什么问题

用户来这里不是"搜索一次"，而是要**找到那一个人**。这是一个需要反复斟酌、缩小范围、最终走向"我想认识这一个"的过程。

当前流程的真实问题（我观察到的，不是迎合）：

1. **结果出现后是"死的"**。Agent 给完 6 个人，就沉默了。用户面对一堵卡片墙，不知道下一步该做什么——是再描述？是点开看？是收藏？流程在最关键的节点断了。
2. **右侧 Canvas 和左侧对话脱节**。点选一个人是右侧的事，反馈也是右侧的按钮；左侧 Agent 完全不参与"你正在看谁、你怎么想"。Agent 退化成了一次性搜索框。
3. **细化没有抓手**。用户想"再年轻一点"、"换个城市"，但当前界面没有任何提示告诉他们可以这么说，也没有展示"当前生效的条件"——所以用户不敢迭代，只能重开一轮。
4. **没有终点**。即使用户保存了几个，产品也没有引导他"从这几个里挑一个真正想认识的"。Saved 抽屉是一个静态列表，不是决策工具。

## 解决方案的本质

把单次搜索改造成一段**有节奏的筛选对话**：

```text
描述  →  Agent 给一批  →  Agent 主动追问 / 用户细化  →  范围收窄
                                   ↓
                          聚焦到 1–3 个候选
                                   ↓
                       Agent 帮用户做最后的决定
```

Agent 在每个节点都要**说下一句话**，让用户永远知道现在可以做什么。

## 接下来的交互流程（4 个明确阶段）

**阶段 1 · 描述 (Describe)**
保持现状：空状态 + 示例 chips + 输入框。不动。

**阶段 2 · 浏览 (Browse)** — 重点改造
- Agent 给出结果后，**紧接着主动追问一句**，例如：
  - "Want me to narrow this down? Try: *younger*, *closer to where you live*, or *more into the outdoors*."
- 左侧聊天底部出现**"Active filters"小条**：把 Agent 解析到的 signals（年龄段、城市、兴趣关键词）作为可点 chip 显示，点 × 即移除并自动重跑。
- 右侧 shortlist tile 增加**轻量 hover 操作**："Tell me more" / "Not for me"，点击后会以**用户语气**写入左侧对话（"Tell me more about Maya"），让 Agent 用一段话回应这个人的特别之处——而不是简单切换选中态。

**阶段 3 · 聚焦 (Focus)** — 新增
- 当用户对某个人点了"Tell me more"或保存，Agent 在左侧生成一段简短的"为什么这个人对你来说有意思"的解读（基于 signals 重合），并追问"Want to see more like them, or keep looking around?"
- 右侧详情区在底部显示三个对等行动：**Save**、**Pass**、**Find more like them**。后者会自动构造一个"more people who share X, Y with [name]"的查询，闭环回阶段 2。

**阶段 4 · 决定 (Decide)** — 新增
- 当 `savedIds.length >= 2` 时，Header 的 Saved 按钮旁出现一个轻量提示："Ready to choose?"
- 打开 Saved 抽屉时，顶部多一行 Agent 文案："You've saved N people. Want me to help you compare them?"
- 点 Compare → 右侧 Canvas 切换为**对比视图**：保存的人并排展示 essence / what they love / what they're looking for，下方 Agent 用一段话指出他们彼此的差异（"Maya is more about quiet evenings; Jun is more about shared projects."），帮用户做出"我想先认识谁"的决定。
- 每个人下方一个明显的 **"Reach out"** 按钮（MVP 阶段只是占位 toast：'In the real product, this would open a conversation.'）——这是产品的终点，必须存在。

## 视觉与文案原则（继承上一版，不重新发明）

- 中性灰、克制基调、mono 行动行不变。
- Agent 追问也用 mono `›` 前缀，但允许 1–2 句自然语言，不再只是 "6 matches"。
- "Active filters" chip 复用 border + secondary 底色，点击态加 1px 实色边框。
- 对比视图最多 4 列（超出滚动），不引入图表/动画。

## 需要改动的文件

- `src/lib/agent.ts`
  - 新增 assistant part：`{kind:'followup', key:'narrow_hint'}`、`{kind:'insight', personId, sharedKeys}`、`{kind:'compare_invite'}`
  - `runQuery` 后自动追加 `followup` part
  - 新增 `actTellMore(personId)`：写入用户消息 + 生成 insight part
  - 新增 `actFindSimilar(personId)`：基于该人的 signals 触发新一轮 query
  - 暴露 `activeSignals` 用于左侧 chips
- `src/components/chat.tsx`
  - 在 Composer 上方新增 `<ActiveFilters />` 行
  - 渲染新的 assistant part 类型
- `src/components/shortlist-tile.tsx`
  - hover 显示 "Tell me more" / "Not for me"
- `src/components/candidate-detail.tsx`
  - 底部三按钮：Save / Pass / Find more like them
- `src/components/saved-drawer.tsx`
  - 顶部 Agent 引导句；≥2 人时显示 Compare 按钮
- 新增 `src/components/compare-view.tsx`：对比视图，含 Reach out 占位
- `src/lib/conversation.ts`：导出 signal → 可读 label 的映射，供 chips 使用
- `src/locales/en/common.json` + `src/locales/zh-CN/common.json`：新增上述所有文案 key

## 不做的事

- 不引入 LLM、不接后端、不改数据模型。
- 不增加新路由——所有阶段都在同一个 Workspace 内推进。
- 不做匹配百分比、不做"红娘"式拟人化文案。

## 验收

- 一次新会话从描述到决定不需要离开页面，且每一步用户都能看到 Agent 的下一句引导。
- 用户能通过点 chip 的 × 直接收窄结果，不需要重新打字。
- 保存 ≥2 人后能进入对比视图，并在每个人下方看到 Reach out 入口。
- SSR / hydration 一致：所有新文案走 i18n，初始 `en`，不调用 `Date.now()` / `Math.random()` 渲染期间。
