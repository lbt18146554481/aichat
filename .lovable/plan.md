把当前 Agent 对话里「自动生成的新问题」（chip 按钮）从消息气泡末尾移到输入框上方，保持现有行为不变。

具体改动
1. 提取当前有效建议
   - 在 `src/components/workspace.tsx` 中沿用已有逻辑：只取最后一条 assistant 消息上的 `chips` 作为可操作的建议。

2. 在输入框上方渲染建议
   - 在 `<Composer>` 与免责声明之间新增一行 `ChipRow`。
   - 当没有可用 chips 时，该区域自动隐藏，不占用空间。

3. 从消息流中移除建议
   - 删除原来渲染在 `AssistantBubble` 下方的 `ChipRow`，让 assistant 消息只保留文本。

4. 保持交互一致
   - `disabled` 仍受 `thinking` 或 `composerDisabled` 控制。
   - 点击 chip 仍调用 `onChipClick` 并回传原始 action。

5. 微调样式（如需）
   - 如果 `ChipRow` 在输入框上方显得太拥挤，可调整 `chat-primitives.tsx` 中的 `mt-2` 与 `mb-2` 间距，或给外层加 `pb-2`。

不改动的部分
- 不改动 `side-by-side.ts` 的建议生成逻辑。
- 不改动 chip 的 action 类型与点击后的处理。
- 不改动 TA 卡片、聊天右侧 pane、Agent 记忆等逻辑。

涉及文件
- `src/components/workspace.tsx`：主要布局改动。
- `src/components/chat-primitives.tsx`（可能）：微调间距。