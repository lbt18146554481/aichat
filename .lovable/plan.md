
## 判断

你的意思很清楚：**默认匹配卡不变**（保留一句话 "why is TA"，保留活动摘要，保留主 CTA），只是**多一个明显的入口**让愿意深入的人可以主动看更多。这跟真实社交节奏一致：先扫一眼决定要不要深入，感兴趣再点开看。

所以这一版**只做加法**：加一个入口 + 一个抽屉。不动主卡片布局，不改按钮层级，不改文案 hierarchy。

## 入口放哪里

有三个候选位置，我选 **B**：

- A. 独立按钮 `[了解更多 TA]` 放在 CTA 旁边 → **不选**：三个按钮平级，视觉上主 CTA 被稀释，反而不简洁。
- **B. 让身份行本身可点** → 头像 + 姓名的整行做成可点区域，右侧带一个小 `chevron`（›）图标 + 极小字 "更多"。这是最轻的入口——想看就点头像/名字，符合直觉（社交产品里点头像看资料是通用心智）；不想看的人视觉上几乎无干扰。**选这个。**
- C. WhyPerson 那一句话下面加一个 text link "查看 TA 的更多" → **不选**：把 "why" 那句变成引子，读起来像广告，破坏它的分量。

## 产品结构

```text
右侧 MatchView（保持现状，只加一个可点区）
┌──────────────────────────────┐
│ MATCH ─────────  还有 3 位候选     │
│                                │
│ ┌──────────────────────────┐ │  ← 整块可点（hover 有轻底色）
│ │ [头像]  June, 28           │ │
│ │        上海 · 独立设计师   › │ │  ← 尾部小箭头 + 极小 "更多"
│ └──────────────────────────┘ │
│                                │
│ ✦ 为什么是 TA                     │
│ TA 也安静、爱读书，周末常在美术馆…      │  ← 保持不动
│                                │
│ 🎾 网球 · 周六早上 · 中级            │  ← 保持不动
│                                │
│ [   开始聊 TA   ]                │  ← 保持不动
│    [看下一个]                     │
│  不合适？告诉左边的 Agent            │
└──────────────────────────────┘

点身份行 → 右侧 Sheet 抽屉滑入
┌────────────────────────────┐
│  ✕                          │
│  [大头像]                     │
│  June, 28                   │
│  上海 · 独立设计师              │
│  ────────────────────────   │
│                              │
│  TA 是谁                     │
│  "两年前从北京搬到上海……"        │  ← personBrief
│                              │
│  最近在读                     │
│  📖 《房思琪的初恋乐园》         │  ← oneWork
│  "读到一半停不下来……"          │
│                              │
│  TA 分享过的瞬间               │  ← moments 前 3 条
│  • 上周六在明珠美术馆待了一下午    │
│  • 学生时代打过网球队…          │
│  • 一个人做饭时会放播客         │
│                              │
│  你们要一起做的事              │
│  你说 "想找人打网球"            │  ← 两条 intent 原话
│  TA 说 "想找搭子长期打"         │
│                              │
│  ─── 底部粘性 ───             │
│  [ 开始聊 TA ]                │  ← 看完立即行动，无需回上层
└────────────────────────────┘
```

## 改动

### 1. `src/components/canvas/meet-canvas.tsx`

**`MatchView`：**
- 把现有身份 block（头像 + 姓名 + `age · city · occupation`）包成一个 `<button>`（或 `role="button"` 的 div），加：
  - `hover:bg-muted/40` 过渡
  - 尾部一个 `ChevronRight` 图标（`w-4 h-4 text-muted-foreground`）
  - 图标下面/右边一个极小 uppercase 标 "更多 / More"（`text-[10px] font-mono tracking-wide text-muted-foreground`）
- 无障碍：`aria-label={t("intent.open_profile", { name })}`。
- 主卡片其它一切保持不变（why 段、activity 行、按钮组、footnote）。
- 顶部本地 state `const [openProfile, setOpenProfile] = useState(false)`。

**新增内嵌组件 `<PersonProfileSheet person, mine, other, lang, onStartChat, open, onOpenChange>`：**
- 用 shadcn `Sheet`：`side="right"`，`className="w-full sm:max-w-md p-0 flex flex-col"`。
- Header（不粘）：关闭 × + 大头像（`w-16 h-16 rounded-full`）+ 姓名 + `age · city · occupation`。
- 中间滚动区（`overflow-y-auto flex-1`），四个 section 顺序：
  1. **TA 是谁** → `person.personBrief[lang]`，缺失则整段隐藏。
  2. **最近在读** → `person.oneWork`（emoji by kind + title + why），缺失则整段隐藏。
  3. **TA 分享过的瞬间** → `person.moments` 前 3 条 `answer_zh|answer`，`<ul>` 圆点列表；不足 3 条按实际数量展示；一条都没有则整段隐藏。
  4. **你们要一起做的事** → 复用现有 `intent.you_said` / `intent.they_said` 引号块 + 一行 aligned tag。
- 底部粘性区（`border-t p-4 bg-background`）：`[开始聊 TA]` 主按钮，点了先 `onOpenChange(false)` 再 `onStartChat()`。
- fallback 态（`?fresh=1`）：section 1 变成琥珀色 "告诉 Agent 你想找什么样的人" 输入框（复用 `WhyPersonBox` 的 fallback UI 或提取共用），其余 section 照常从数据渲染。

**装配：**
- 在 `MatchView` 里渲染 `<PersonProfileSheet open={openProfile} onOpenChange={setOpenProfile} ... />`。
- 身份行 `onClick={() => setOpenProfile(true)}`。

### 2. i18n keys（新增到 `src/locales/{en,zh-CN}/common.json`）

- `intent.open_profile` — "了解更多 {{name}} / More about {{name}}"（aria-label + tooltip 用）
- `intent.more_hint` — "更多 / More"（身份行尾部小字）
- `intent.sheet.about_ta` — "TA 是谁 / About TA"
- `intent.sheet.one_work` — "最近在读 · 看 · 听 / Into right now"
- `intent.sheet.moments` — "TA 分享过的瞬间 / Moments TA shared"
- `intent.sheet.aligning` — "你们要一起做的事 / What you're aligning on"
- `intent.sheet.start_chat_here` — "开始聊 TA / Start chatting"（Sheet 底部 CTA；也可直接复用现有 `intent.match_start_chat`）

### 3. 不做的事

- **不动**主卡片的 why 一句话、活动摘要、主/次按钮、footnote 文案。
- **不新增路由**，不改 `Person` 类型（`personBrief` / `moments` / `oneWork` 已有）。
- **不改** NoMatch / Chat / Empty / EditWishPanel 视图。
- **不加** "喜欢/举报/收藏" 等无意义边角动作。
- **不改** 左侧 Agent 对话与分派逻辑；Sheet 打开时 Agent 依然可见可用。
- History 抽屉、workspace-header、home 完全不动。

## 验收

1. 打开一个已匹配的 session，右侧看到的匹配卡跟之前完全一样（头像 / 姓名 / 一句话 why / 活动行 / CTA），唯一新增：身份行 hover 时有轻底色，尾部有 `›` 加极小 "更多" 字样。
2. 点身份行任意位置（头像 / 名字 / 尾部箭头）→ 右侧滑入 Sheet，能看到 personBrief、oneWork、3 条 moments、双方 intent 原话 + 活动 tag。
3. Sheet 底部按钮 `[开始聊 TA]` = 主卡片 `[开始聊 TA]`，都进入右侧 chat 视图；进入时 Sheet 自动关闭。
4. 按 Esc 或点遮罩关闭 Sheet，主卡片状态无变化。
5. 点 `[看下一个]` 换人后再打开 Sheet，显示的是新的那个人的资料；点 `[编辑心愿]` 也不影响。
6. 缺 personBrief / oneWork / moments 中任何一项的候选人，对应 section 静默隐藏，Sheet 不出现空块。
7. 语言切 zh ↔ en，Sheet 内所有字段随之切换。
