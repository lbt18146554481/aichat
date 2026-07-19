## 问题诊断

上一版里「已收藏」的入口只在匹配卡右上角一个 chip，而且只在 `savedCount ≥ 1` 时出现。用户的顾虑合理：

- 关掉抽屉、或者一直点 See next 翻下一位，那个 chip 一直在，但视觉太弱，用户会怀疑「东西是不是丢了」。
- 一旦 See next 把池子翻空进入 NoMatch，Match 卡上的 chip 就消失了；NoMatch 里虽然有大块入口，但两处样式不一致，用户脑子里没有「一个固定的收藏抽屉入口」这个模型。
- Save 一次性 toast 3 秒后消失，之后再想回想「我按过收藏吗」没有痕迹。

核心问题不是「加更多入口」，而是**让收藏入口在整个 do-something-together 画布里成为一个恒定、始终可见、位置固定的元素**，无论当前是 Match / NoMatch / Chat 的哪个视图，无论 See next 翻了几次，它都在同一个位置、同一种样式。

## 交互设计（简化后的完整流程）

**画布右上角常驻一个「Saved · N」胶囊按钮**，位置固定在 `MeetCanvas` 顶部，脱离具体子视图。规则：

1. **一直可见**：只要当前 wish 还活着（stage ≠ prompt），胶囊就在，`N = 0` 时显示为 disabled 的浅色态、文案「Saved」，不可点击但占位——让用户建立「这里就是收藏的家」的空间记忆。
2. **计数即时更新**：Save 时数字 +1 并做一次 250ms 的 pulse 动画，作为「东西进这里了」的视觉锚点，替代原来的 toast。取消 toast，不再有一次性提示。
3. **点击打开抽屉**：任何视图下都打开同一个 `SavedDrawer`，内容和操作不变（查看资料 / 开始聊天 / 取消收藏）。
4. **See next / 翻页无关**：胶囊不属于候选卡，翻卡时不会重渲染、不会消失。
5. **Chat 视图也保留**：进入聊天后本 session 收藏会被清空（既有逻辑），胶囊自然回到 disabled 态，用户能看到「收藏在聊天开始后归零」，符合心智。

底部三按钮设计沿用上一版：`[Start chat] [♡ Save / ✓ Saved] [See next →]`，Save 是 toggle，与 See next 完全解耦。

## 关键流程回放

```text
用户看卡 A
   ├─ 点 ♡ Save     → A 进入收藏，按钮变 ✓ Saved，右上角胶囊 0→1 pulse，卡片不动
   ├─ 点 See next   → 换到卡 B，胶囊仍在，数字仍是 1
   ├─ 卡 B 也 Save  → 胶囊 1→2 pulse
   ├─ 池子翻完      → NoMatch 视图，胶囊仍在同一位置，另有一行醒目引导「先回看你收藏的 2 位」
   └─ 点胶囊或引导 → 打开同一个抽屉，查看 / 聊天 / 取消收藏
```

关闭抽屉后回到卡面 → 胶囊仍在原位 → 用户永远知道去哪找。

## 技术改动

`src/components/canvas/meet-canvas.tsx`
- 把「Saved 胶囊」和 `SavedDrawer` 提升到 `MeetCanvas` 顶层组件，用一个 `useState` 管 `openSaved`；从 `MatchView` 和 `NoMatchView` 中移除各自的 chip 与抽屉副本。
- 胶囊定位：`MeetCanvas` 用一个 `relative` 外壳，胶囊 `absolute top-3 right-3`，`z-10`；`N=0` 时 `opacity-50 pointer-events-none`。
- Pulse 用 `useEffect` 监听 `savedIntentIds.length` 的自增，触发一次 250ms 的 scale 动画（`transition-transform` + `key` 变化 或 tailwind `animate-[pulse_0.25s]`）。
- 移除 `MatchView` 里的一次性 toast（`justSaved` state + 相关 JSX），改由胶囊 pulse 承担反馈。
- `NoMatchView` 内保留大块「先回看你收藏的 N 位」引导（点击后打开同一个 `openSaved` 状态）。

`src/lib/agents/side-by-side.ts`
- 无改动。`saveCurrent` 仍是纯 toggle（上一版已定）。

`src/locales/{en,zh-CN}/common.json`
- 复用 `intent.saved_count`、`intent.saved_open`、`intent.saved_title`；删除上一版新加的 `intent.saved_first_hint`（不再需要 toast 文案）。

## 不做

- 不加浮层提示、气泡、tooltip——胶囊自身就是提示。
- 不给胶囊做拖拽 / 展开预览。抽屉已经够快。
- 不改 Chat 视图布局；那里胶囊是 disabled 态，纯占位。
- 不把 Saved 入口放到左侧 Agent 对话框里。收藏是「右侧候选池」的行为，跨到左边只会让心智更乱。
