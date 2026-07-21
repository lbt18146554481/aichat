
# Introduce Someone 详情右侧再精简 & 左侧 Agent 建议指令

## 一、先想清楚：One Work（One Film / Book / …）到底留不留

结论：**保留，但必须"挣得版面"——从展示物 → 会话钩子**。

理由（站在用户"我要不要跟 TA 说一句话"的决策链上）：
- Moments 是 TA 亲口写的"人格证据"；One Work 是 TA 亲口挑出的"品味证据"。两者是不同维度的开口话题——删了就少一根开场白钩子，而这个产品的核心动作就是"打招呼"。
- 但**当前的呈现方式没有下一步动作**：用户看完 title + why 后不知道能做什么，所以觉得"莫名其妙"。问题不在内容本身，在于它没有绑定动作。
- 解决方案：压缩成 1 行 + 绑一个动作 —— **点击 = 以这件事为切入点打招呼**（把 title/why 作为草稿注入 composer）。这样它就从"资料条目"变成"最短路径的开场白"。
- 如果 `person.oneWork` 缺失，整块直接隐藏（不留空占位）。

## 二、右侧详情信息层级（改造后 · 每块都对应一个下一步）

```
┌─ 头部（点击 = 打开公开资料 Sheet）
│  ● 头像[Eye]  Hugo · 32
│              Journalist · Shanghai
│              portrait 一句话画像
│              动作：看更多 → PublicProfileSheet
│
├─ signals chips（5 个，纯展示）
│  ⌇ Agent's note · 一句话推荐理由（脚注引用体）
│  动作：无（此块是"三秒扫读判断是否合眼缘"，本身就是决策器）
│
├─ 一条最匹配的 moment（› prompt / 原话）
│  ↳ 查看全部（弱链接 → Sheet）
│  动作：点击原话 = 引用这段话打招呼（注入 composer 草稿）
│
├─ One Work（压缩成 1 行 · 仅当存在）
│  ⌾ Cares about {kind}: 《title》— why 截 40 字…
│  动作：点击 = 以这件事切入打招呼（注入 composer 草稿）
│
└─ Say hello / Save / See someone else（完全不改）
```

关键紧凑化措施：
- One Work 从多行卡（title / meta / why 三段）压成 **单行 muted card**：一行 icon + kind + title + " — " + why (truncate)；hover 变亮 + 光标 pointer 提示可点。
- 头部下方的 `View full profile` 虚线小字 hint 冗余（Eye 图标已足够+整个头部可点），删除。
- signals 卡与 moment 卡之间的分隔靠自然间距，不再画多余分割线。
- 整体行高与卡片 padding 略收（`py-3` → `py-2.5`；块间距 `mt-6` → `mt-5`）——目标是首屏就能看到"Say hello"按钮或至少看到 One Work。

## 三、动作绑定的具体行为

复用现有 composer 流程（`requestSayHello` 已存在）：
- **点击 Moment 原话**（非撰写态）：进入撰写态 + 预置引用（就是"撰写态点击一条 moment 引用"的现有能力，只是把非撰写态的入口也接上去）。
- **点击 One Work 单行卡**：进入撰写态 + 预置一段 opener 草稿，如：  
  英：`Saw {name} cares about "{title}" — {why 截断}. Curious what drew them in.`  
  中：`看到 {name} 在乎《{title}》——{why 截断}。想问问 TA 是怎么开始喜欢上的。`  
  草稿仅作为初始文本，用户可自由改写/清空。
- 不改按钮区、不改 composer 组件本身。

## 四、左侧 Agent 输入框上方新增"建议指令" chips

目的：解决"用户面对空输入框不知说什么"的静默期。chips 是**贴着当前情境**的一键短语，点击 = 填入输入框（不自动发送，用户可再改）。

情境分支（按 `MatchmakerState.phase` + 当前是否有 currentPersonId + 匹配池状态）：

| 情境 | chips |
|---|---|
| clarifying（还没介绍过人） | "想认识安静一点的人" / "不想要太激烈的" / "希望对方在乎创作" / "跟我节奏差不多的" |
| introducing · 有 currentPerson | "多说说 TA" / "换一个感觉不一样的" / "有没有更松弛的" / "想认识做{与 TA 相关的一个 signal}的人" |
| introducing · 池子空了（`L.none_left`） | "放宽一个条件" / "换个我没提过的特质" / "我再想想，稍后回来" |

技术：
- chips 数据由一个纯函数 `suggestChips(state, lang)` 返回 `string[]`，`ChatComposer` 组件在 textarea 上方渲染一行水平滚动的按钮。
- 点击 → 调用 composer 已有的 `setDraft(text)` 或等价 setter（若无则暴露一个 `onSuggest(text)` prop 由父级 setState）。
- 不改变对话协议、不新增消息类型；chips 只是"预填输入框"的糖。

## 五、技术改动清单

1. `src/components/canvas/intro-canvas.tsx`
   - 头部：删除 `intro.view_profile` 虚线小字提示行。
   - One Work 板块：整个 JSX 从多行改为单行 muted card；绑 `onClick` → `requestSayHello()` + 预置草稿。
   - Moment 板块（非撰写态）：外层 wrapper 从只读 → `role="button"` + `onClick` = 进入撰写态并选中该 moment 作为引用（复用撰写态已有的 pickMoment 逻辑）。
   - 微调间距（`mt-6` → `mt-5`，卡片 `py-3` → `py-2.5`）。

2. `src/components/hello-composer.tsx`（若草稿注入接口不存在）
   - 暴露初始 `draft` prop 或 `initialText`，在打开时若为空则填入。已有 quote 机制的话优先复用。

3. `src/components/chat-primitives.tsx`（或 Matchmaker 侧输入组件所在文件）
   - 在 `<textarea>` 上方新增 `<SuggestionRow suggestions={...} onPick={(t) => setDraft(t)} />`。
   - 样式：`flex gap-1.5 overflow-x-auto pb-2`，chip 是小号 outline button。

4. `src/lib/agents/matchmaker.ts`（或新建 `src/lib/agents/suggestions.ts`）
   - 导出 `suggestChips(state, lang): string[]`，按上面 3 种情境分支返回。

5. `src/locales/{en,zh-CN}/common.json`
   - 新增：
     - `intro.one_work_action_hint`（accessible label / tooltip）
     - `intro.opener_from_one_work`（草稿模板，含 `{name}` `{title}` `{why}` 占位）
     - `suggest.clarify.*`（4 条）、`suggest.introducing.*`（4 条）、`suggest.empty.*`（3 条）
   - 删除：`intro.view_profile`（不再使用）—— 或保留 key，仅 UI 不渲染，避免 i18n key 引用报错时再处理。

## 六、不改动范围

- 底部三键（Say hello / Save / See someone else）的位置、顺序、行为、样式——**完全保持**。
- `PublicProfileSheet`、`Person` 数据模型、路由、会话/滚动位置持久化——不动。
- 左侧 Agent 的对话协议、`userTurn` / `introduce` 逻辑——不动，chips 只是输入框糖。
- Composing / connected / faded 三态的整体状态机——不动。

## 七、验收清单

- One Work 存在时压成 1 行且可点击，点击后 composer 打开并带草稿；不存在时整块隐藏。
- Moment 单条原话在非撰写态可直接点击进入引用状态。
- 首屏（约 720px 高的右侧面板）能同时看到头部 + signals + moment + One Work + 按钮区中的至少 Say hello。
- 左侧输入框上方出现 2-4 个情境 chips；切换情境（clarify → introducing → none-left）时 chips 内容随之变化；点击 chip 只填入不发送。
- `bunx tsgo --noEmit` 通过。
