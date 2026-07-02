# Profile 子页体验优化：顶部即返回，随填随存，去掉"保存"心智

## 用户视角的问题

用户从 Say hello 跳到 `/profile` 后：
1. 顶部左上角的返回箭头写着 "Kindred"，指向 `/`——用户第一反应就是点它回上一页，结果被带到首页，Matchmaker 上下文视觉上"消失"（虽然 sessionStorage 里还在，但用户已经不在那条路径上）。
2. 底部还有一个 "Done" 按钮才是真正带 `return` 逻辑的返回入口，位置远、层级低、用户不一定滚到。
3. 顶部 + 底部两个"离开"入口做的是不同的事，认知负担重。
4. 表单已经是随填随存（`ProfileForm` 里 `useEffect(saveProfile)`），但页面顶部进度条 + 底部 "Done" 按钮让用户误以为"必须点 Done 才保存"。

核心矛盾：**顶部返回键的目的地和用户当前的来源路径不一致**，且**"保存"这一动作在 UI 上被过度强调**，与实际的自动保存机制不符。

## 设计目标

1. 顶部返回键 = 智能返回：有 `return` 上下文时回 Agent，无则回首页——用户点哪个都能回到对的地方。
2. 全站去掉"保存"这个词，改成"随时可离开，改动已自动保存"的心智。
3. 底部不再有"必须点它"的 Done 按钮，避免和顶部返回竞争注意力。

## 具体改动

### 1. `src/routes/profile.tsx` — 顶部即返回

- 顶部左上角：把 `<Link to="/">Kindred` 换成"上下文感知"的返回按钮：
  - 若 `sessionStorage["kindred:profile:return"]` 存在（`/matchmaker` 或 `/side-by-side`），文案显示为 "← Back to Matchmaker" / "← Back to Side by Side"（中文对应"← 返回牵线人 / 返回并肩人"），点击执行现在 `finish()` 里那套 return-key 消费逻辑。
  - 否则显示 "← Kindred"，点击回 `/`。
  - 用一个 `handleBack()` 函数统一处理，替换原 `<Link>`。
- 顶部右侧：把"1/3"进度条换成一个安静的自动保存指示："已自动保存 · 随时可离开"（`profile.autosaved_hint`）。进度信息可以移到下方 heading 区，作为参考，不再抢眼。
- 顶部 return-hint banner 保留，但文案改为"改动会自动保存，随时点左上角回去打招呼"（`hello.gate.return_hint` 微调）。
- 底部 section：删除 "Done" 按钮及其容器。整个页面不再有底部 CTA。滚到底就是滚到底。

### 2. `src/components/canvas/intro-canvas.tsx` — 返回后自动检查

- 从 `/profile` 返回 `/matchmaker` 后，`IntroCanvas` 挂载时读取 `loadProfile()`，若此时 `hasName + isVitalsComplete` 已满足且 draft 里 `composing=true`，则 composer 保持打开（当前已由 draft 恢复覆盖）。无需新增逻辑，只需确认现有 draft 恢复在返回路径上工作正常。
- 追加：Say hello 点击时，若 profile 已完成 vitals 则不再写入 `return` key（当前逻辑已经是这样），保持不变。

### 3. 文案

**`src/locales/en/common.json`**
- `profile.autosaved_hint`: "Autosaved · leave anytime"
- `hello.gate.return_hint`: "Changes save as you type — hit the back arrow whenever you're ready."
- `hello.gate.back_to_matchmaker`: "Back to Matchmaker"
- `hello.gate.back_to_sidebyside`: "Back to Side by Side"
- 删除 `hello.gate.return_cta`、`profile.done_generic`（不再有底部按钮）。

**`src/locales/zh-CN/common.json`**
- `profile.autosaved_hint`: "已自动保存 · 随时可离开"
- `hello.gate.return_hint`: "改动会自动保存，随时点左上角回去打招呼。"
- `hello.gate.back_to_matchmaker`: "返回牵线人"
- `hello.gate.back_to_sidebyside`: "返回并肩人"
- 删除对应旧 key。

### 4. 不改动

- `ProfileForm` 内部随填随存逻辑不动。
- `hasName / isVitalsComplete / profileProgress` 不动。
- Matchmaker / Side-by-Side 状态持久化不动。
- IntroCanvas 的 draft 持久化不动。
- 首页 nudge、Header Profile 链接不动（那两条路径没有 return key，走"回 `/`"的自然路径）。

## 用户新体验

1. 未填 profile 用户点 Say hello → `/profile`，顶部左上角显示"← 返回牵线人"，右上角显示"已自动保存 · 随时可离开"，banner 说"改动会自动保存，随时点左上角回去打招呼"。
2. 用户填几个字段——不看到任何"保存"按钮，也不需要点。
3. 想回去随时点左上角箭头 → 回到 `/matchmaker`，消息 / 候选人 / composer 草稿全部原样。
4. 从首页 nudge 或 Header 进入 → 顶部箭头显示"← Kindred"，点它回首页。
5. 页面底部干净，没有孤立的"Done"按钮，没有"你还没保存"的暗示。

## 验收

1. 从 `/matchmaker` 点 Say hello 到 `/profile`，顶部左上角文案为"返回牵线人"，点击回 `/matchmaker` 且对话上下文保留。
2. 从首页 nudge 到 `/profile`，顶部左上角文案为 "Kindred"，点击回 `/`。
3. `/profile` 页面无底部 Done 按钮。
4. 填一个字段后刷新 → 数据仍在。
5. 从 `/side-by-side` 进入 `/profile`，顶部箭头文案为"返回并肩人"，点击回 `/side-by-side` 且对话保留。
6. 顶部右侧显示"已自动保存 · 随时可离开"，不再显示"1/3"进度。
