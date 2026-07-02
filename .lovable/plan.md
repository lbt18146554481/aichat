
# Say hello 极简化：composer 只做输入，引用从上方 moment 带下来

## 目标

一屏内不出现同一条 moment 两次。Composer 只负责"写一句话并发送"；引用是可选的，通过在上方原有的 moments 上点击来"带下来"。

## 文件改动

### 1. `src/lib/connections.ts`

将 `HelloFromMe.quotedMomentId` 类型从 `string` 改为 `string | null`（允许无引用发送）。两处消费方 `intro-canvas.tsx` 的 `YourHelloRecap` 和 `connection-thread.tsx` 都用 `person.moments.find(...)`，返回 undefined 时已有 `if (!m) return null` 保护，无需改动。

### 2. `src/components/hello-composer.tsx` — 完全重写为极简

移除：内部的 moments 列表、"pick one" 标签、"your reply" 标签、reply hint。

保留结构：
- 顶部：如果外部 `initialPicked` 指向一条 moment，渲染一个小的"引用块"（prompt + 答案 + 右上角 × 取消引用）。没有则不渲染。
- 中间：一个 textarea（rows=4），placeholder 根据是否有引用切换（"回应这一段…" / "想对 TA 说的第一句话…"）。
- 底部：右对齐 [取消] [发送]。发送禁用条件仅 `!reply.trim()`（引用不再是硬门槛）。

Props 保持：`moments / lang / initialPicked / initialReply / onDraftChange / onSubmit / onCancel`。`onSubmit` 签名改为 `(quotedMomentId: string | null, reply: string) => void`。新增 effect 监听 `initialPicked` 变化以跟随外部点击。

### 3. `src/components/canvas/intro-canvas.tsx` — moments 就地可点

**Moments section**（约 157–179 行）：composing 时每条 `<article>` 变成 `<button>`；未 composing 时保持原样式（纯展示）。

- 选中项左边条从 `border-border` 换为 `border-foreground`（宽度不变，仅颜色，保持克制）。
- 未选中项保持现在样式；composing 时 hover 出现极弱的 `border-foreground/40` 提示可点。
- 点已选中的那条 → 取消引用（setDraftPicked(null)）。
- 默认无选中：`setDraftPicked(null)` 初始，用户不点就是"无引用"。

**Section 标签**（158–160 行）：composing 时文案换为 `moment.compose_hint`（"想聊哪一段？点一下引用（可选）"）；非 composing 保持 `moment.about_them`。

**handleHello**（116–122 行）：签名改为 `(quotedMomentId: string | null, reply: string)`，直接透传给 `sayHello`。

**移除**（233–237 行）：`!userHasMoments` 的 `need_user_moments` 提示块——此提醒放在 profile 未完成的引导里更合适，composer 前不再堆叠。

**HelloComposer 调用**：保留原 props；`moments` 仍然传入用于渲染顶部引用块。

其余（header / One Work / 等待态 YourHelloRecap / connected 状态）不动。

### 4. 文案 `src/locales/en/common.json` + `src/locales/zh-CN/common.json`

在 `moment` 命名空间新增：

- `compose_hint`
  - en: "Which one do you want to reply to? Tap one — optional."
  - zh: "想聊哪一段？点一下引用（可选）。"
- `reply_placeholder_open`
  - en: "The first thing you want to say to them…"
  - zh: "想对 TA 说的第一句话……"
- `reply_placeholder_quoted`
  - en: "Reply to this moment…"
  - zh: "回应这一段……"
- `remove_quote`
  - en: "Remove quote"
  - zh: "取消引用"

保留但不再引用：`pick_one` / `your_reply` / `reply_hint` / `reply_placeholder` / `need_user_moments`（暂不删除，避免影响其他潜在引用）。

## 新体验

1. 打开 TA 卡片：header → moments → One Work → [Say hello] [Pass]。
2. 点 Say hello：composer 出现，只有一个 textarea + 发送/取消；上方 section 标签变成"想聊哪一段？点一下引用（可选）"，moments 可点击。
3. 用户想引用某条 → 点它 → 该条左边条高亮 + composer 顶部出现引用块。再点同一条或 × → 取消。
4. 写完点发送。

一屏内 moments 只出现一次；composer 只做发送本身该做的事。

## 验收

1. Composer 内不再出现任何 TA 的 moment 文本副本（除顶部"当前引用"预览）。
2. 上方 moments 在 composing 时可点选/取消；非 composing 时保持展示状态。
3. 无引用时也可发送；连接记录中 `quotedMomentId` 为 `null`。
4. `YourHelloRecap` 与 `ConnectionThread` 在 `quotedMomentId` 为 null 时静默跳过引用块，其余照旧显示回复内容。
5. Typecheck 通过（`HelloFromMe.quotedMomentId: string | null` 传导干净）。
