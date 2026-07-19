## 目标
把 Do something together 里的两个核心操作修到稳定、可理解：
- 点 `Save` 后按钮立即变成黑色 `Saved / 已收藏`，顶部全局 `Saved` 入口立即出现。
- 点 `See next` 后必须换成视觉上不同的人；如果没有新的人，明确进入“没有更多人”的状态，而不是看起来没反应。

## 当前已确认的问题
1. `Save` 的全局入口依赖本地存储订阅与当前页面状态同时刷新，容易出现按钮已点但 Header 入口没立即出现的体验。
2. `See next` 现在只排除当前 `intentId`。同一个人如果有多条匹配 intent，下一次可能仍然匹配到同一个 `ownerId`，用户看到头像/名字不变，会感觉“没有换人”。
3. `Save` 和 `See next` 都通过延迟 `setTimeout` 修改状态，连续点击或状态还没落盘时容易产生不一致反馈。

## 修复方案
### 1. Save：改成明确、同步、全局可见
- 保留 `Save` 与 `See next` 独立，不自动跳到下一个。
- `saveCurrent` 继续写全局 Saved store，但把 session 回退值改得更稳：优先 `sessionId`，没有时用当前 wish id，避免空 session 记录导致抽屉回链失败。
- `SavedTrigger` 增强：除监听自定义订阅外，也在打开/渲染时重新读取一次全局 store，确保 Header 入口马上出现。
- `Save` 按钮状态以全局 saved store 为准，点后立即刷新为：黑底、`BookmarkCheck`、`Saved / 已收藏`。

### 2. See next：按“人”而不是按“intent”跳过
- 在 `skipMatch` 中跳过当前人的所有 intents，而不是只跳过当前 intent。
- 扩展匹配函数支持 `excludeOwnerIds`，`findAllMatches / findMatch / countAvailableMatches / findNearMisses` 都能排除已看过的人。
- 在 `SideState` 增加或复用一个稳定的“已看过 owner”集合，确保下一位一定是不同的人。
- `remaining` 的禁用逻辑也按“剩余不同的人”计算，避免按钮可点但结果还是同一个人。

### 3. 避免状态竞态
- `handleSave` 与 `handleSkip` 保持短反馈，但避免重复写入造成多条无意义提示。
- 点击 Save 时只追加一次“已收藏 / 已取消收藏”的 Agent 消息。
- 点击 See next 时，如果真的没有下一位，右侧进入 pool exhausted / no match，而不是留在同一张卡。

### 4. 验证
- 用浏览器实际跑一遍：发布一个能匹配的心愿 → 点 Save → 确认按钮变黑、Header 出现 Saved → 打开 Saved 抽屉看到该人。
- 点 See next → 确认头像/名字变化；连续点直到没有更多人 → 确认按钮禁用或进入无更多人的文案。
- 检查没有 Vite overlay / 控制台错误。