
## 核心问题诊断

现在两个"人物详情"存在数据源混乱：

- **用户自己的 Profile**（`src/lib/profile.ts`）字段：avatar / name / age / city / occupation / gender / orientation / mbti / moments / favorites（+ hidden 可见性）。
- **Demo 人物数据**（`src/lib/people.ts` 中的 `Person`）多出来一堆：`portrait`（一段文学化描述）、`personBrief`（"About TA"）、`signals`（标签）、`angles`（"⌇ 为什么想到你"）、`activities`（What they do）、`whyPersonLine`（一起做点什么的匹配理由）。这些字段**用户自己在 Profile 里根本无法填写**，只有 seed 数据里硬编码存在。
- 因此两个详情页在"真实用户"和"demo 用户"上会长得完全不一样，且用户提问"About TA / signals / What they do 从哪来"——答案是"AI 编的 / seed 硬写的"，站不住脚。

## 设计原则

**同一个数据模型 = 用户填的 Profile。所有展示层（个人卡、Introduce 详情、Do Something Together 详情）都从这一个模型渲染。** demo 人物 = "预先填好 Profile 的用户"。

匹配相关的说明（"为什么合适 / 你说 / TA 说 / aligning tag"）不属于 Profile，是**匹配层的产物**，独立成一个块，不要塞进 Profile Sheet。

## Profile 模型调整

在 `Profile` 增加一个字段：

- **`bio: string`**（可选，≤ 140 字的一句话自我介绍）——替代原来 seed 里那种散文式的 `portrait` / `personBrief`。用户能填、能编辑、能通过 hidden 隐藏。
- 保留：avatar / name / age / city / occupation / gender / orientation / mbti / bio / favorites / moments / hidden。
- **删除展示层里没有真实来源的概念**：`signals`、`angles`、`portrait`（文学化那段）、`personBrief`、`activities`、`what they do`。

## Seed 数据（`people.ts`）改造

把每个 demo Person 改成"预先填好的 Profile"：只保留 name / age / city / occupation / gender / orientation / mbti / bio / favorites / moments 这些字段（多语言仍保留 `_zh`）。

- 匹配用的元数据（`whyPersonLine`、`openerSuggestion`、`replyHints`、`Intent.rawText` 等）**保留在匹配层**，不进 Profile Sheet。
- `signals` 如果匹配算法内部还需要，可以保留成**内部字段**，但**不再向用户暴露**。
- `activities` 已被弃用于用户端，seed 也一并移除。

## 三个显示位统一

新建**一个** `PublicProfileView` 组件（或复用现有 `PublicProfileSheet` 改造），字段顺序固定：

```
[头像 · name · age] · [city · occupation]  (gender / orientation / mbti 若未 hidden 追加)
—— bio ——
—— Favorites ——
—— Moments ——
```

严格按 `hidden[]` 过滤。所有其他字段一律不显示。

使用位置：

- 首页 / TabBar "我" 的自查预览。
- Introduce Someone 详情页头像点击（现在的 `PublicProfileSheet`）。
- Do Something Together 匹配卡头像点击（现在 meet-canvas 内部的 `PersonProfileSheet` 删掉，改为直接复用同一个组件）。

## Introduce Someone 右侧列表页重构

现在混在一起的：identity + signals + angle + moment + actions。重构成**清晰的三段**：

1. **人**（可点击展开完整 Profile Sheet）——头像 / 姓名 / 年龄 / 城市 / 职业 / bio 一句。**去掉** signals chips 和 `⌇ angle` 那行斜体（这两个都是 AI 编的/来源不明）。
2. **一个 Moment**——TA 自己写的一段话，可点击"引用并回复"。这是匹配理由里最能站住的部分（引用的是 TA 亲自写的内容）。
3. **动作区**——Say hello / Save / See someone else（保持现状）。

匹配理由如果要展示，用**一行**："因为 TA 也写过 …"（quote 那条 moment）——不再另起一段"Why I thought of you"。

## Do Something Together 匹配卡重构

`meet-canvas.tsx` 里的 `PersonProfileSheet`（About TA / One Work / Moments / Aligning）拆成两块：

- **Profile Sheet 部分**（About TA / One Work / Moments）→ **删掉本地实现，改用统一的 `PublicProfileView`**，直接读该人的 Profile（无 bio 时该段不显示，同 hidden 规则）。
- **Aligning 部分**（你说 / TA 说 / kind·when·level 芯片）→ 保留，但作为匹配卡主页面的一个独立小节，**不放进 Profile Sheet**。这是"为什么这次匹配"，与"TA 是谁"分开。

主卡片保留：identity 行（点开 Profile）、one-liner 匹配理由、你说 / TA 说、Start chat / Save / Next。

## 技术改动清单

- `src/lib/profile.ts`：`Profile` 增加 `bio: string`；`EMPTY_PROFILE` / `loadProfile` 兼容旧数据；`hidden` 支持 `"bio"` key。
- `src/lib/types.ts`：`Person` 删除 `portrait / portrait_zh / signals（对外）/ angles / activities`；保留 `moments / favorites / whyPersonLine / openerSuggestion / replyHints`；新增 `bio / bio_zh`。
- `src/lib/people.ts`：seed 每个人补 `bio`，删除对应字段；`localized()` 相应调整。
- `src/components/profile-form.tsx`：加 bio 输入 + eye 开关。
- `src/components/public-profile-sheet.tsx`：删除 signals / activities / portrait 段；按新顺序渲染；按 hidden 过滤（含 bio）。
- `src/components/canvas/intro-canvas.tsx`：删除 signals chips + angleText；简化到 identity + one moment + actions。
- `src/components/canvas/meet-canvas.tsx`：删除本地 `PersonProfileSheet`，改用统一 `PublicProfileSheet`；把 Aligning 段留在主卡片。
- `src/components/agents/matchmaker.ts`：如果 `pickBestAngle` 只服务被删的 angle 展示，一并清理（保留 `pickBestMoment`）。
- `src/locales/*/common.json`：删除 `intro.about_them / signals_label / what_they_do / intent.sheet.about_ta / one_work` 等已不使用的键；新增 `profile.bio_label / bio_placeholder / bio_hint`。

## 用户可见变化

- Profile 编辑页多一个"一句话介绍自己"输入框（可眼睛图标隐藏）。
- 三处"看某人详情"看到**同样的结构**，字段全部来自 TA 自己填的 Profile。
- Introduce / Do Together 详情页更短、更聚焦，没有来源不明的 signals / What they do / portrait / About TA 描述段。
- 匹配理由（一起做什么）依然在匹配卡上可见，但不再伪装成"TA 是谁"。

## 确认点

如果你希望**保留** signals（作为用户可手动打的标签）或**保留** portrait（作为用户可选的一段文学化自我描述而不是 AI 编造），告诉我，我把它并入 Profile 的可编辑字段而不是删掉。默认按上面"删除来源不明字段、加一个 bio 替代"来实施。
