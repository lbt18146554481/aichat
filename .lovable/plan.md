## 判断先行

你选"彻底删 Activities"这条路，代价是清楚的：Side-by-Side 从此不再读用户档案里的常规活动节奏，改由**当次心愿文本 + 同城硬过滤**独立支撑匹配。这条线原本就已经能跑（心愿里都会指明活动+时间+水平），所以删掉 Activities 不会让 Side-by-Side 崩，只会让"档案预填一份周节奏、供以后复用"这个便利消失——收益（Profile 更瘦、板块无重叠）大于代价，接受。

Favorites 你把设计交给我，我选**克制的单行清单**这条：不做卡片外壳，不做 kind 芯片组，why 用引号斜体压成一句话。视觉上像一段读书笔记，而不像一张表单。

## 目标形态

Profile 收到 **3 段**：

```
01 Vitals       身份底线（含头像 / 城市必填 / MBTI 可选）
02 Moments      你自己说的话（≥3）
03 Favorites    你喜欢的东西（≥1，最多 6）
```

Favorites 的最终样子：

```
📖  《呼吸》 · 特德·姜             ×
    "凡是要花力气记住的都值得。"

🎬  《在爱与生活之间》 · 侯麦          ×
    "把'无所事事的下午'拍得像宗教。"

+ 再加一条
```

规则：
- 每条一行：`kind 图标 + 标题（可含作者/副标题，用户自己排版）` 在上，`why` 在下方一行灰色小字，带引号
- kind 用图标而非文字芯片，点击图标弹出小 popover 选类型（book/film/music/exhibition/food/other），默认 book
- 标题占位符：`书名 · 作者` / `电影 · 导演` 等按 kind 变化
- why 占位符：`一句话，为什么它对你重要`
- 没填的空条目自动不进保存，也不阻塞完成度
- 添加时直接 inline 展开一条空行，不弹卡片

## 改动清单

### 1. 数据模型 `src/lib/profile.ts`
- 删除 `activities` 字段、`UserActivity` 类型、`ActivityCadence` 类型
- 删除 `addActivity` / `updateActivity` / `removeActivity` / `MAX_ACTIVITIES`
- `loadProfile` 迁移旧数据：`activities` 字段静默丢弃
- `isProfileComplete` / `profileProgress` 已经不依赖 activities，无需改动
- `EMPTY_PROFILE` 移除 `activities: []`

### 2. 表单 `src/components/profile-form.tsx`
- 删除整个 Activities 板块（`ActivitiesField` 组件、`ACTIVITY_KIND_OPTIONS`、`CADENCE_OPTIONS` 等相关常量与渲染块）
- 把 Favorites 板块从卡片式重写为**单行清单式**：
  - 每条一行两栏：左侧 kind icon 按钮（Lucide 图标：BookOpen / Film / Music / Landmark / UtensilsCrossed / Sparkles），点击弹 popover 切换类型
  - 右侧上下两行：Title 单行 input（无边框，只有底部细线，focus 时高亮）+ Why 单行 input（更小字号，斜体，占位文案带引号）
  - 每行末尾一个 hover 才显示的 `×` 移除按钮
  - 底部一个 `+ 再加一条` 的纯文字按钮（到 MAX_FAVORITES=6 时禁用并变灰）
  - 空态：默认渲染一条 book 空行占位
- `PreviewCard` 里的 Favorites 展示也同步换成单行样式（去掉外壳、去掉标签）
- 板块序号从 4 段收到 3 段：Vitals → Moments → Favorites

### 3. 匹配器 `src/lib/agents/side-by-side.ts`
- 移除对 `profile.activities` 的读取（如果有）。若当前无引用，只需确认。

### 4. i18n `src/locales/{en,zh-CN}/common.json`
- 删除：`profile.section.activities*`、`profile.activity.*`、`profile.cadence.*`、以及 Activities 相关的所有 key
- Favorites 的 key 复用现有的即可；新增或调整占位符文案：
  - `profile.favorite.title_placeholder.book` / `.film` / `.music` / `.exhibition` / `.food` / `.other`
  - `profile.favorite.why_placeholder`（改成带引号的口吻，如 `一句话，为什么它对你重要`）
  - `profile.favorite.add_more`（"+ 再加一条" / "+ Add another"）
- 进度条 total 从 3 保持 3（Vitals + Moments + Favorites），无需改

### 5. 兼容旧数据
- 老用户 localStorage 里若存在 `activities`，`loadProfile` 直接丢弃，不做提示、不做迁移。其它字段照常保留。

## 不动的东西
- 头像上传 / MBTI / 城市必填 / Moments 板块
- Public Profile Sheet 里 Favorites 的分组展示（TA 看你时仍按 kind 分组，不受表单形态影响）
- Side-by-Side 主流程（活动从心愿文本抽取这条已经在跑）
- 语言切换、路由、历史、Saved

## 验收
- `/profile` 从 4 段变 3 段，无 Activities 板块残留
- Favorites 每条以"图标 + 标题 + 一行斜体 why"呈现，无卡片外壳；添加/移除流畅，最多 6 条
- 空条目不阻塞完成度；填够 1 条即算达成
- 老档案打开后 Vitals/Moments/Favorites 完好，`activities` 静默丢失
- Side-by-Side 匹配仍能正常跑（不再依赖 profile.activities）
- `bunx tsgo --noEmit` 通过；无 i18n key 缺失或未使用告警
