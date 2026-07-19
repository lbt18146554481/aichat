## 目标
调整全局页眉图标顺序，把「Saved（已收藏）」入口移动到「Connections（连接）」之后。

## 改动
- **src/components/workspace-header.tsx**：调整右侧操作区渲染顺序，将 `<SavedTrigger />` 从当前位置（Reset 之后）移动到 Connections 相关入口（alert 徽章 / `connCount > 0` 链接）之后、`Profile` 链接之前。其余元素（Profile、Reset、History、LangSwitcher）位置保持不变。

## 最终顺序（从左到右）
Connections（如有） → Saved → Profile → Reset（可选）→ History → LangSwitcher

无其它逻辑或样式改动。