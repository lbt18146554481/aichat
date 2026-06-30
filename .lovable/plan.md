## 目标

把产品收敛为两个 Agent——**Matchmaker**（描述→引荐）和 **Side by Side**（爱好→见面）。Compass 的价值观/人生观数据不丢，作为 Matchmaker 的一个内部匹配信号继续发挥作用。

## 改动范围

### 1. 删除 Compass 相关文件
- `src/routes/compass.tsx`
- `src/lib/agents/compass.ts`
- `src/components/canvas/resonance-canvas.tsx`
- `src/lib/questions.ts`（不再被任何 Agent 直接使用，但 `people.reflections` 仍引用 questionId，所以保留为只读的标签字典；见下）

> 备注：`questions.ts` 是否完全删除取决于 Matchmaker 是否需要在引荐理由里展示「TA 对『...』这个问题的回答是……」。我建议**保留**该文件作为问题文本字典（只读），不再作为 Agent 的驱动数据。

### 2. 首页改为两个 chip
`src/components/home.tsx`：CHIPS 数组去掉 compass 项，保留 matchmaker 与 sidebyside。

### 3. 意图路由简化
`src/lib/route-intent.ts`：
- 删除 `TALK` 关键词表与对应分支
- `AgentId` 收敛为 `"matchmaker" | "sidebyside"`（在 `src/lib/seed.ts` 同步）
- 默认 fallback 仍为 `matchmaker`

### 4. Matchmaker 吸收价值观信号
`src/lib/agents/matchmaker.ts`：
- 候选人评分时，若 `understanding.positive` / `notes` 与候选人的 `reflections.answer` 有关键词重叠（复用原 Compass 的 `similarity` 思路，迁移到一个共享的 `src/lib/text-similarity.ts`），加分。
- 引荐画像（右侧 canvas）在合适位置展示候选人**最具代表性的一段 reflection**（取与用户描述相似度最高的一条），作为「TA 自己写下的一段话」。这一段是引荐说服力的来源，不是独立的共鸣环节。
- 不引入「匿名共鸣」「同题对答」「揭示身份」这些 Compass 专属的交互。

`src/components/canvas/intro-canvas.tsx`：在现有引荐画像中新增一个安静的小区块「TA 自己说」（label 化），展示 1 段 reflection 原文。

### 5. 文案与导航清理
- `src/locales/{en,zh-CN}/common.json`：删除 `home.chip.talk`、`agents.compass.*`、`home.agents_footnote` 中提到的三 Agent 描述改成两 Agent。
- `src/routeTree.gen.ts`：自动重新生成（不手工改）。
- 任何指向 `/compass` 的 `<Link>` 全部移除。

### 6. 数据兼容
- `src/lib/people.ts` 中 `reflections` 字段保留，结构不变（被 Matchmaker 复用）。
- `localStorage` 中的旧 key `kindred:compass.v1` 不再读写，留着自然过期，不做迁移代码。

## 不做的事
- 不动 Side by Side 任何逻辑与 UI。
- 不动 Matchmaker 的对话流框架与左对话/右画面骨架，只在评分与画像渲染处增加 reflection 信号。
- 不引入新的依赖。
- 不改 i18n 框架，只增删 key。

## 验收
- 首页只剩两个 chip，文案与路由对齐。
- 输入「想聊聊人生」之类的话不再路由到 Compass，而是落到 Matchmaker。
- 进入 Matchmaker 后，引荐画像里能看到候选人的一段 reflection 原文。
- 无运行时报错、无失效路由、无未使用 import。
- `/compass` 直接 404（由根路由的 `notFoundComponent` 处理）。
