# 最小化端到端冒烟测试（Playwright）

目标：用一个轻量脚本在真实浏览器中验证「登录 → 首页 → 会话列表」核心链路可跑通。**不触碰任何页面代码、样式或交互**，只新增测试文件与脚本入口。

## 覆盖范围（5 个断言，全部只读操作）

1. 首页可加载且水合完成（出现输入框、"Maitri" 品牌名，无控制台报错）
2. 未登录时提交心愿被引导到 `/auth`
3. 邀请码 + OAuth 模拟登录成功（走真实 UI，登录态写入本地存储）
4. 登录后首页显示 History / Saved / Connections 入口
5. `/sessions` 会话列表页可访问：提交一次心愿后，History 中出现且仅出现一条记录

## 技术方案

- 新增 `tests/e2e/smoke.py`：Chromium headless，桌面视口 1280x1800，直连已运行的 `http://localhost:8080`；失败时截图到 `tests/e2e/screenshots/`。
- 复用现有 `tests/e2e/flows.py` 中已验证的辅助逻辑（`hydrated` 等待水合、邀请码注册流程、`record` 结果汇总），保持选择器风格一致（`get_by_role` / `data-testid`，不新增测试属性）。
- 每个断言独立 `browser_context`，避免状态互相污染；全部通过则 exit 0，任一失败 exit 1，便于后续接 CI。
- `package.json` 增加脚本 `"test:e2e": "python3 tests/e2e/smoke.py"`（仅新增一行，不改动其他脚本）。

## 不做的事

- 不修改 `src/` 下任何文件，不新增 `data-testid`，不改动路由或文案。
- 不接入 CI 工作流（如需要可后续单独加）。
