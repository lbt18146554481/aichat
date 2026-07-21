
# Introduce Someone 详情页重构（v2）

## 用户决策链——先想清楚，再决定展示什么

用户站在这个页面时，只在做一件事：**「我要不要主动和 TA 说一句话？」**

围绕这一个决定，反推信息优先级——每一块内容如果不能推动这个决策，就不该占版面：

| 决策问题 | 用户想看到的 | 判断 |
|---|---|---|
| TA 是谁？ | 头像 + 姓名 + 年龄 + 职业 + 城市 | 保留 |
| TA 大致是怎样的人？ | 一句话画像（portrait） | **新增**，从头像身份区里带出 |
| TA 有哪些具体特质？ | 3-5 个 signal 标签 | 保留但简化 |
| Agent 为什么推荐 TA？ | 一句话的推荐理由 | 保留，但**降格为脚注引用** |
| TA 亲口说过什么？ | 1 条最能打动人的原话 | **只留 1 条**（决策钩子够了） |
| TA 在意的一件事？ | One Work | 保留 |
| 我要不要打招呼？ | 三个动作按钮 | **完全不动** |

## 关于「他说过的话」板块——保留但要精简

结论：**必须保留，但只展示 1 条**。

原因：
- Moments 是 TA **亲口写下**的答案，是「人格证据」，比 Agent 的推荐话术可信度高一个量级；这是让用户从「感觉像还行」跨到「我想跟 TA 说话」的关键钩子。
- 但**当前 3 条 moment 全部展开**是设计错误：非撰写状态下，用户不需要 3 条同等权重的原话，只需要 1 条最能触发对话欲望的。剩下的 2 条只会拉长版面、稀释注意力。
- 撰写状态（composing）下则相反——用户要挑一条引用，必须看到全部。

方案：
- **非撰写态**：只展示 1 条「最匹配」的 Moment（用 `pickBestAngle` 相同的 signals-overlap 思路选出，如无匹配则回退到第 1 条），下方一个极小的 muted 链接「查看全部 · TA 还说过什么」→ 打开 `PublicProfileSheet`。
- **撰写态**：保持现有逻辑，展开全部 moments 供点选引用。

## 结构总览（改造后）

```
┌─ 头部（可点开公开资料）
│  ● 头像[Eye]  Hugo · 32
│              Journalist · Shanghai
│              一句话画像 portrait（12.5px muted）
│
├─ WHO THEY ARE 卡（原「Why I thought of you」重命名+重写）
│  [signal] [signal] [signal] [signal] [signal]
│  ─────
│  ⌇ Agent's note · 一句话推荐理由（引用体，斜体、mono 前缀）
│
├─ IN THEIR WORDS
│  › prompt
│    最匹配的 1 条 moment 原话
│  ↳ 查看全部 · TA 还说过什么 (弱链接→打开 PublicProfileSheet)
│
├─ ONE {book|film|…}
│  Title
│  Why
│
└─ 按钮区（保持不变）
   [ Say hello ] [ ⌾ Save ] [ see someone else ]
```

## 关键改动

### 1. 头部
- 头像 + 名字 · 年龄 · 职业 · 城市 保持可点击（打开 `PublicProfileSheet`），Eye 图标保留。
- **删除**「View full profile」下划线文字提示（Eye 图标已足以暗示）。
- 在职业·城市**下方新增一行** `loc.portrait`（12.5px muted，1-2 行）——把「TA 是怎样的人」这层信息前置到 3 秒内可读。

### 2. 「WHO THEY ARE」卡（原 Why I thought of you）
- Label 从 `WHY I THOUGHT OF YOU / 我为什么想到 TA` → `WHO THEY ARE / TA 是怎样的人`。
- Chips：直接展示 `person.signals.slice(0, 5)`——统一为「TA 的特质」，不再区分「共同」/「他们的」双分支（那个分支本身就是设计噪声）。
- Agent 的一句话理由：**降格为脚注引用体**——细分割线之下、mono 小字前缀 `Agent's note ·`，斜体正文。避免和 signals 平起平坐、语义混淆。
- **删除 `personBrief` 展示**：和头部 portrait 语义重叠；完整版仍在 PublicProfileSheet 内可见。

### 3. Moments 板块
- 标题文案 `moment.about_them`：
  - 中：`Three small things about {{name}}` → `TA 是这样说的`（去掉 `{{name}}`）
  - 英：→ `In their own words`
- 非撰写态：**只渲染 1 条**——用新工具函数 `pickBestMoment(person, understanding)`（与 `pickBestAngle` 同思路：先找 prompt/answer 与 user positives 交集最大者，回退第 1 条）。下方追加弱链接「查看全部 · TA 还说过什么」，点击 `setProfileOpen(true)`。
- 撰写态：不变，展开全部 moments 供选。

### 4. One Work
- 不改。

### 5. 按钮区（**遵守用户约束：不改动布局**）
- Say hello / Save / See someone else 三键**保持现在的位置与并排关系**。
- **删除**下方两段解释性 hint：
  - `connection.save_hint`（"I'll keep them under Saved · People…"）
  - `connection.save_hint_saved`（"They're under Saved · People…" + 「see someone else」重复入口）
- 保存与否的状态用按钮本身的 `Save ↔ Saved` 视觉切换传达即可，无需文字解释。

## 技术改动清单

- `src/components/canvas/intro-canvas.tsx`
  - 头部：删除「View full profile」链接元素；在职业·城市下方新增 `<p>{loc.portrait}</p>`。
  - 匹配卡：删除 shared / their-signals 分支；signals 一律取 `person.signals.slice(0, 5)`；angle 改为脚注引用体（分割线 + mono 前缀 + italic）；删除 personBrief block。
  - Moments：非撰写态改为 `moments.length > 0 && renderOne(pickBestMoment(...))` + 弱链接跳 PublicProfileSheet；撰写态保持 `.map`。
  - 按钮区：删除两段 `<p>` hint；按钮本身及 `flex-wrap` 布局保持不变。
- `src/lib/agents/matchmaker.ts`
  - 新增 `pickBestMoment(person, understanding)`：与 `pickBestAngle` 同思路，用 answer 文本的 signal-overlap 或 tokens-jaccard 作为分数，回退首条。
- `src/locales/en/common.json` + `src/locales/zh-CN/common.json`
  - 新增 `intro.who_they_are_label`：`WHO THEY ARE` / `TA 是怎样的人`
  - 新增 `intro.agent_note_prefix`：`Agent's note` / `Agent 观察`
  - 新增 `intro.see_all_moments`：`See all · what else they've said` / `查看全部 · TA 还说过什么`
  - 修改 `moment.about_them`：`In their own words` / `TA 是这样说的`（去掉 `{{name}}`；调用点同步简化为无参）
  - `connection.save_hint` / `connection.save_hint_saved`：本次不删除 key（保留兼容），仅在 UI 停止渲染

## 不改动范围

- 底部三键的布局、位置、顺序、行为——**完全保持**。
- `PublicProfileSheet` 组件本身——保持，作为「查看更多」的落地页。
- 数据模型、路由、存储、滚动位置持久化、composer 草稿逻辑——不动。
- Composing / connected / faded 三态的现有逻辑——不动。
