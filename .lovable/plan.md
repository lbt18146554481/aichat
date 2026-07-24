## 目标
把 Introduce Someone 右侧详情压成一条清晰的决策动线：**是谁 → 关键特征 → Agent 为什么想到 TA → TA 亲口说过的一句 → 决定是否打招呼**。深度信息全部退回到公开资料 Sheet。

## 改动

### 1. `src/components/canvas/intro-canvas.tsx`

**a. 拆掉 "Who they are" 卡片外壳(第 312-341 行)**
- 去掉外层 `rounded-lg border bg-card` 容器和 `WHO THEY ARE` 大写标题。
- Signals chips 紧贴头部下方(`mt-3`),无框、无小标题,只是一排轻量 chips。
- Agent 注解一行斜体 muted 文字紧接 chips,前缀符号极轻(如 `⌇`)或省略。视觉上像注脚而非独立板块。

**b. Moment 板块精简(第 344-364 行)**
- 保留一条最匹配 Moment(可点击进入引用撰写态)。
- **删除 "See all · what else they've said" 链接**——头部整块已可打开公开资料 Sheet(Sheet 内展示全部 Moments),此入口冗余。
- 移除浏览态的 `moment.about_them` 小标题,让 Moment 直接紧接 Agent 注解,形成"Agent 说 → TA 亲口说"的自然串联。
- 撰写态保留 `moment.compose_hint`。

**c. 删除 One Work 单行卡片(第 366-392 行)**
- One Work 属于"深度了解"层,与"是否合眼缘"的决策无关。感兴趣的用户可从头部点入公开资料 Sheet 查看(Sheet 里完整展示 One Work)。
- 同时删除相关变量 `work` 使用点、`t("intro.one_work_opener", ...)` 调用。

**d. 版面收紧**
- 各块间距从 `mt-6` / `mt-7` 视觉上统一为一条连续段落感,不再靠框线切割。

### 2. 本地化清理(`src/locales/en/common.json` 与 `zh-CN/common.json`)

删除不再使用的键:
- `intro.who_they_are_label`
- `intro.agent_note_prefix`(如仍需前缀改用符号)
- `intro.see_all_moments`
- `intro.one_work_opener`
- `moment.about_them`

保留 `moment.compose_hint`(撰写态仍使用)。

## 不改动
- Header 头像/名字/portrait 与公开资料 Sheet 入口逻辑
- 底部按钮区(Say hello / Save / See someone else)及其状态机
- 左侧 Agent 建议 chips
- 草稿/滚动位置持久化
- `pickBestAngle` / `pickBestMoment` / matchmaker 逻辑
- 数据模型、公开资料 Sheet 内部内容(One Work 仍在此处完整展示)

## 验收
- 右侧详情从 header 到按钮区一屏内呈现:头部 → chips → Agent 注解一行 → 一条 Moment → 按钮。
- 无 "See all" 链接;无 One Work 卡片;无 "Who they are" / "In their own words" 分区标题。
- 点击 Moment 仍能进入引用撰写态;点击头部仍能打开公开资料 Sheet(其中包含全部 Moments + One Work)。
- `bunx tsgo --noEmit` 通过,无 i18n key 缺失警告。