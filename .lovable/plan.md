
# Introduce Someone 详情页优化：可点击的资料入口 + 更清晰的匹配理由

## 目标与用户流程

站在用户角度，详情页目前的头部只有「头像 + 名字 + 年龄 · 职业 · 城市」，信息量太单薄；再往下直接跳到 Moments，用户很难在 3 秒内理解「Agent 为什么把这个人推给我」，也没有入口去查看这个人更完整的一面。

优化后的核心流程：
1. 一眼看到匹配亮点：头像下方有一张「为什么是 TA」的卡片，用共同标签 + 一句话理由说明推荐逻辑。
2. 想深入了解就点头像：头像和名字变成可点击入口，滑出「公开资料」侧边栏，展示这个人对外可见的完整信息。
3. 保持右侧主区域的简洁：亮点卡是概览，详细资料在侧边栏，Moments / One Work 仍是主区域的「人的证据」，Say hello / Save / See next 三个动作不变。

## 具体设计

### 1. 顶部：可点击的身份区

- 头像和名字合并为一个 `button`，点击打开「公开资料」侧边栏。
- 头像右下角增加一个极轻的「查看资料」提示（悬浮时显现的下划线 + `Eye` 图标，尺寸不超过 12px），保持视觉安静。
- 键盘可达：`aria-label="View {name}'s profile"`。

### 2. 新增「为什么是 TA」匹配亮点卡

位置：身份区正下方，Moments 之前。视觉：`rounded-lg border bg-card`，与 One Work 卡片同一档次。

内容结构：
- 顶部一行 mono 小字 `WHY I THOUGHT OF YOU`（中：`我为什么想到 TA`）。
- 共同标签芯片：从 `person.signals ∩ understanding.positive` 里取前 3 个作为 `Chip`，用 i18n 词典翻译。
  - 若交集为空，回退到该人 `signals` 前 3 个（表示「TA 的关键词」而非「你们的共同点」），并改用文案 `THEIR SIGNALS / TA 的关键词`。
- 一句话理由：从 `person.angles` 中挑选与用户 `understanding.positive` 交集最多的那条，展示其 `text` / `text_zh`。这是已有数据，目前完全没用到。
- 底部一行 `personBrief`（若存在），作为「TA 大致是个怎样的人」的两三句描述。

这样用户 3 秒内能得到三层信息：共同点是什么 → Agent 的推荐话术 → TA 的整体画像。

### 3. 新增 `PublicProfileSheet` 侧边栏

从右侧滑出，宽度与现有 `SavedTrigger` 一致。内容分区（自上而下）：
- 大头像 + 名字 · 年龄 · 城市 · 职业。
- Portrait：`portrait` / `portrait_zh` 一句话画像。
- Signals：把该人所有 `signals` 以 chip 形式全展示（比亮点卡更全）。
- About them：`personBrief`（若无则不显示该分区）。
- Their moments：完整 `moments` 列表（含 prompt + answer），与主区一致但只读。
- One work：与主区一致。
- What they do：如果 `activities.length > 0`，展示每条活动的 kind · level · area（三段式紧凑排版），让用户看到 TA 现实生活的样子。

关闭方式：右上角 `X`、点击遮罩、Esc 键。移动端全屏化，桌面端 `max-w-md`。

侧边栏本身不带任何跨页跳转，仅作为「只读资料查看」。避免打断当前 Say hello / Save 的核心动线。

### 4. 交互与边界

- Composer 打开时（`composing === true`），头像入口仍可点击，侧边栏为覆盖层，不影响正在起草的内容（`sessionStorage` 草稿逻辑已存在，无需变动）。
- 已连接 / 已淡出等状态下，亮点卡与资料侧边栏依然可见（用户想再复习一下 TA 是谁）。
- 亮点卡的匹配逻辑纯本地计算，不新增网络或 storage 依赖。

## 技术实现要点（供开发参考）

- 文件改动：
  - `src/components/canvas/intro-canvas.tsx`：改造头部为可点击入口；新增 `WhyThemCard` 子组件；引入 `PublicProfileSheet` 并管理其 open state。
  - `src/components/public-profile-sheet.tsx`（新文件）：接收 `person: Person`，纯展示组件；使用 `Sheet` 原语或复用 `SavedTrigger` 的抽屉实现。
  - `src/lib/agents/matchmaker.ts`：导出一个小工具 `pickBestAngle(person, understanding)`（沿用现有 `scorePerson` 的 signals 交集思路），供 `WhyThemCard` 复用。
  - `src/locales/{en,zh-CN}/common.json`：新增 `intro.why_them_label`、`intro.their_signals_label`、`intro.view_profile`、`intro.public_profile_title`、`intro.about_them`、`intro.what_they_do`、`intro.signals_label` 等键。
- 保持所有变更仅在 UI/展示层；无数据模型、后端或路由变更；不影响现有滚动位置恢复、草稿保存、`originSessionId` 返回路径等逻辑。
