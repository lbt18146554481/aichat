## 先回答"应不应该这么做"

你的方向是对的，但理由要立得住，不是因为你提了我就接受。

**为什么左右布局确实更服务产品本质：**

1. **候选人才是 Agent 真正交付的"产物"**。在单列布局里，候选人卡片和对话混在一起，每次刷新一轮搜索，上一批人就被消息流冲走。Agent 的成果没有"留存的工作台"。
2. **对话是手段，画面是目的**。左侧 chat 是控制台（你和 Agent 说话），右侧 canvas 是 Agent 持续维护的结果——当前 shortlist、被细化的标准、已保存的人。这正是 v0、Claude Artifacts、Cursor、ChatGPT Canvas 的范式，因为它对"AI Agent 产出可交互产物"的产品形态最贴切。
3. **强化 Agent 心智**。左边能看到 Agent 在思考、解析、搜索；右边能看到它给你筛出来的人。两栏并置时，"Agent 在为我工作"的感受比单列强得多。
4. **细化迭代变得有意义**。"再年轻一点"、"换个城市"、"不要这种类型"——你说完话，眼睛不用移动，就能看到右边的 shortlist 在变化。这是单列做不到的体验。

**风险与边界（避免迎合式照搬）：**

- 移动端必须有清晰的降级，不能硬塞两栏到 375px。
- 右栏不能变成"花哨的可视化"。它就是一个 shortlist + 候选人详情，克制、信息密度合理。
- 不引入第二个对话状态、第二套交互——Agent 的所有指令仍然只来自左侧 chat。

## 新布局

```text
Desktop (>= 1024px)
┌──────────────────────────┬────────────────────────────────┐
│  Kindred                 │  Shortlist · 6                 │
│                          │  ─────────────────────────────│
│  › parsed criteria       │  ┌──────┐ ┌──────┐ ┌──────┐    │
│  › searching…            │  │ card │ │ card │ │ card │    │
│  › 6 matches             │  └──────┘ └──────┘ └──────┘    │
│                          │  ┌──────┐ ┌──────┐ ┌──────┐    │
│  (user) calm, late 20s   │  │ card │ │ card │ │ card │    │
│  (agent) Here's what I…  │                                │
│                          │  ─── Detail (selected) ───     │
│                          │  [larger profile view, full    │
│                          │   essence / what they love /   │
│  ┌────────────────────┐  │   what they're looking for /   │
│  │ Tell the agent…  ⏎│  │   Save / Dismiss]              │
│  └────────────────────┘  │                                │
└──────────────────────────┴────────────────────────────────┘
   ~ 40% width                  ~ 60% width
```

- **左栏（chat）**：固定 ~400–460px。只有 Agent 行动行 + 用户消息 + 输入框。再也不在 transcript 里塞候选人卡片。
- **右栏（canvas）**：上半部是当前 shortlist 网格；点一张卡 → 下半部展开该候选人的完整资料（不再跳页）。空状态显示"Describe someone — your shortlist will appear here."
- **Header**：跨两栏顶部，仍含 Saved 抽屉与语言切换。
- **路由收敛**：删除 `/profile/$id` 独立路由，所有候选人交互在右栏内完成。详情即"被选中"状态。Saved 抽屉里点一个人 → 把右栏切到该人详情。

## 移动端 (< 1024px)

不强求两栏。布局降级为：
- 顶部 sticky chip 显示 "Shortlist · N"，点开滑入全屏 sheet（右栏内容）。
- 主体为 chat 单列。
- 输入框 sticky 底部。

这样不损失"Agent 工作台"的语义（只是折叠了），也不挤压 375px 屏幕。

## 删除 / 调整

- 删除：`src/routes/profile.$id.tsx`（详情进入右栏）
- 删除：`profile-card` 中"View profile"跳转链接（改为选中态）
- 调整：`agent.ts` 的 assistant message parts 不再产出 `cards` part；把 `lastResultIds` 提升为右栏读取的全局 state
- 调整：`chat.tsx` 拆为 `<ChatPane>`（左）+ `<CanvasPane>`（右）+ 顶层 `<Workspace>` 容器
- 新增：`canvas-pane.tsx`、`shortlist-grid.tsx`、`candidate-detail.tsx`
- 新增：右栏空状态文案 `canvas.empty_title` / `canvas.empty_hint`

## 视觉细节（继续上一版克制基调，不重新发明）

- 中间用 1px `border-border` 分隔左右栏，无阴影、无装饰
- 右栏背景比左栏深一档（`bg-secondary/40`）以建立层次，但仍是中性灰
- shortlist 卡片：3 列网格，正方形头像 + 一行名字/年龄/城市 + 一行 essence，选中态加 1px 实色边框 + 极轻底色
- 详情区平铺在 shortlist 下方，不弹窗、不动画大于 150ms
- Agent 行动行（mono `›` 前缀）保持不变

## 交付步骤

1. 提升候选人状态到 Workspace 容器：`selectedId`、`shortlistIds`、`savedIds`、`dismissedIds`
2. 重构 `agent.ts`：不再生成 `cards` part；改为返回新 shortlist 并替换 workspace state
3. 新建 `Workspace`、`ChatPane`、`CanvasPane`、`ShortlistGrid`、`CandidateDetail`
4. 删除 `/profile/$id` 路由与相关链接
5. 移动端断点 (`lg:`) 处理：< lg 时隐藏右栏，加 sticky shortlist 按钮 + Sheet
6. 更新 locale 文案（新增 canvas 区域；删除 profile 页文案）
7. 自检：assistant 消息无背景气泡、submit 按钮在 footer、logo 非 Sparkles、SSR 与客户端语言一致

完成后：左边和 Agent 说话，右边永远摆着它当前给你筛出来的人。产品的"Agent 工作"和"Agent 产物"在视觉上被明确分开——这是单列做不到的产品语义。
