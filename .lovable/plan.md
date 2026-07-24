## 判断先行：这些字段到底服务谁

Profile 的唯一读者是**另一方真人**（在 Introduce Someone 右侧详情、Public Profile Sheet 里）和 **Side-by-Side 匹配器**（读活动做硬过滤）。凡是这两处都没有真正读、或读了也不会影响"要不要和 TA 打招呼 / 一起做事"的字段，都是负担。

按这个尺子过一遍现有 4 个板块：

| 现字段 | 谁在读 | 是否影响决策 | 处置 |
|---|---|---|---|
| 01 Vitals (name/age/city/occupation) | 双方 + 系统硬过滤 | 是 | **保留** |
| 02 三道情境题 (weekend/conflict/five_years) | 无处渲染 | 否，且答案是标签化选项，读起来像性格测试 | **删除** |
| 02 Activities | Side-by-Side 匹配 | 是 | **保留** |
| 02 MBTI | 无处渲染 | 否，自报低信号 | **删除** |
| 03 Moments | Introduce Someone 详情页 + Sheet | 是（决定"想不想认识 TA"的核心） | **保留、不动** |
| 04 One Work（限一件） | Public Profile Sheet | 部分——书/影/展是很强的合眼缘信号，但限一件太窄，用户抱怨的正是这点 | **升级为 Favorites 多条** |

> 关于 "How you live" 和 "One thing you've cared about lately" 的目的：前者原本想给系统一个软信号做兼容度打分，但代码里没有一处消费；后者想暴露一个具体作品做谈资，但"只能填一件"限制了它的表达力——两者都没兑现自己的目的，所以**前者删掉，后者改造**。

## 目标形态

Profile 收敛为 **4 段、只讲对方想知道的事**：

```
01 Vitals            身份底线（系统 + 对方都要）
02 What you do       现实中会做的事 —— 活动（Side-by-Side 匹配）
03 Moments (≥3)      你自己的话 —— TA 决定要不要认识你的主材料
04 Favorites         你喜欢的东西 —— 书优先，可加影/乐/展/食，多条
```

## 改动清单

### 1. 数据模型 `src/lib/profile.ts`
- 删除 `CompatibilityAnswers` 类型、`compatibility` 字段、`setCompatibility` mutator。
- 删除 `mbti` 字段。
- 将 `oneWork: OneWork | null` 改为 `favorites: Favorite[]`（`Favorite = { kind: WorkKind; title: string; why: string }`）。
- `MIN_FAVORITES = 1`；`MAX_FAVORITES = 6`；新增 `addFavorite / updateFavorite / removeFavorite`。
- 更新 `isProfileComplete`、`profileProgress`：完成条件 = Vitals + ≥3 Moments + ≥1 Favorite（book 作为默认 kind）。
- `loadProfile` 迁移旧数据：若旧存 `oneWork` 非空则搬入 `favorites[0]`；旧 `compatibility` / `mbti` 静默丢弃。

### 2. 表单 `src/components/profile-form.tsx`
- 删除 `COMPAT_QUESTIONS` 渲染块与 MBTI 输入块。
- **02 板块**收窄为纯 Activities 列表（复用现有 Add/Remove/Cadence UI），标题改为 `profile.section.activities`。
- **04 板块**改成 Favorites 卡片列表：
  - 每条：kind 芯片（book 默认高亮，其它可选）+ Title 输入 + Why（1 句，60 字上限）。
  - 空态占位一条 book 卡片；`+ Add another` 到 `MAX_FAVORITES` 停。
  - 移除条目按 X。
- `PreviewCard` 相应改：One Work 段替换为 Favorites 前 3 条简列。

### 3. 对外展示 `src/components/public-profile-sheet.tsx`
- One Work 单卡片 → **Favorites 组**：按 kind 分组，每条一行 `title — why`；书籍分组置顶。
- 空态整块不渲染。

### 4. 演示数据 `src/lib/types.ts` / `src/lib/people.ts`
- `Person.oneWork?: OneWorkRef` → `favorites?: OneWorkRef[]`（类型不变，只是数组）。
- 种子数据把每个人的 `oneWork` 包成 `favorites: [oneWork]`，并给 2–3 位主要角色补一本书作为第二条（保持 demo 手感）。
- 使用 `oneWork` 的其它调用点（Introduce Canvas 之前已经不再引用；仅剩 Sheet）同步更新。

### 5. i18n `src/locales/{en,zh-CN}/common.json`
- 删除：`profile.section.compat*`、`profile.compat.*`、`profile.mbti.*`、`profile.section.one_work*`、`profile.f.work_title*`、`profile.f.work_why*`、`intro.one_work_label`。
- 新增：`profile.section.activities` / `profile.section.activities_hint`、`profile.section.favorites` / `profile.section.favorites_hint`、`profile.favorite.add`、`profile.favorite.title_placeholder`、`profile.favorite.why_placeholder`、`intro.favorites_label`。
- 保留 `profile.kind.*`（book/film/…）继续复用。

## 不动的东西
- Moments（03）任何 UI 与文案——它已经是 Profile 里价值最高的部分。
- Vitals 字段与"城市必填"逻辑。
- Introduce Canvas 右侧详情结构、按钮区、公开资料 Sheet 的入口。
- 语言切换、路由、导航、会话历史。

## 验收
- `/profile` 页面从 4 段缩到 4 段但更瘦：无情境三问、无 MBTI、无"只能一件"的 One Work。
- 收藏板块能加到 6 条，书籍类型是默认；一条不填也不再阻塞完成度（≥1 即可）。
- Public Profile Sheet 里 Favorites 按类型分组呈现；旧 One Work 只是它的 `favorites[0]` 展示样式。
- 老 localStorage 数据打开 `/profile` 不丢 name/age/city/occupation/moments，`oneWork` 自动迁到 `favorites[0]`。
- `bunx tsgo --noEmit` 通过；无 i18n key 缺失。
