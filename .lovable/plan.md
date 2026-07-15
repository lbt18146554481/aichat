## 目标

去掉 History 列表右侧的状态胶囊（waiting / matched / chatting / revoked），让每一行回到最干净的样子：一个 agent 图标 + 用户那句话 + 相对时间。理由很简单——状态信息对用户没有决策价值，点进去就知道，放在列表里只是视觉噪音。

## 改动

**只改一个文件：`src/components/session-list.tsx`**

- 删掉 `statusChip()` 辅助函数以及它引用的 `SessionStatus` 类型 import。
- 删掉列表 `<li>` 中渲染 `{statusChip(s.status, t)}` 的那一行。
- 保留 agent 图标、seed 文本、相对时间这三样。

## 不做的事

- 不动 `src/lib/sessions.ts` 里的 status 字段和推导函数——底层数据保留，只是列表不再显示，将来若需要在详情页或 Banner 里用还在。
- 不动 i18n 文案（`sessions.status_*` 键继续留着不清理，避免顺手改乱）。
- 不动 History 抽屉、/sessions 页面结构、图标、排序、跳转逻辑。

## 验收

- History 抽屉与 /sessions 页面里，每行右侧不再出现任何状态标签。
- 其他行为（点击跳回对话、时间显示、空状态、"view all"）一切照旧。
