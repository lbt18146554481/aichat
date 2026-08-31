# 扩展 Playwright E2E：资料编辑 / 邀请码 / 会话详情

在现有 `tests/e2e/smoke.py` 之外新增一个测试文件，补充三组核心交互断言。全部只读验证，**不改动 `src/` 任何页面、样式、文案或选择器**，也不新增 `data-testid`。

## 新增断言

### A. 个人资料编辑（/profile）
1. 登录后进入 `/profile` 正常渲染（不被弹回 `/auth`），显示进度文案 `0/3` 之类的计数。
2. 编辑姓名 / 年龄 / 城市后自动保存：刷新页面字段内容仍在，且 `kindred:profile.v1` 中的值与输入一致。
3. 资料补全后进度计数从 `0/3` 变为 `3/3`（用页面文案断言，不读内部函数）。

### B. 邀请码校验（/auth?mode=signup）
4. 空邀请码时 Continue 不进入下一步（仍停留在邀请码步骤）。
5. 无效码被拒绝并给出提示文案（复用 `flows.py` 的 `isn't valid` 断言）。
6. 邀请码单次使用：同一个种子码 `FRIENDS` 注册成功一次后，在新的浏览器上下文（同一 origin 存储已被新 context 清空的情况下不适用，因此改为**同一 context 内退出登录后重复使用**）再次提交该码时被拒绝。
7. 大小写与空格容错：`  welcome  ` 这类输入仍能通过校验。

### C. 会话详情页（History → 详情）
8. 提交一次心愿后，`/sessions` 出现且仅出现一条记录，行文案包含心愿原文片段。
9. 点击该行进入对应工作区（`/matchmaker` 或 `/side-by-side`）且带上 `?session=<id>`，左侧 Agent 对话（`agent-messages`）中能看到刚才那句心愿。
10. 从会话详情返回 `/sessions` 后记录数量仍为 1（不会因为返回重复建会话）。

## 技术方案

- 新增 `tests/e2e/interactions.py`：Chromium headless、桌面视口 1280x1800、直连已运行的 `http://localhost:8080`；沿用 `smoke.py` 的 `record` / `hydrated` / `register` / `shot` 风格与既有 `data-testid`（`agent-messages`、`agent-composer`）。
- 每组断言使用独立 `browser_context`，避免 localStorage 互相污染；邀请码单次使用一项在同一 context 内通过应用自身的登出入口完成。
- 截图落到 `tests/e2e/screenshots/`（已 gitignore 之外不新增目录规则）；全部通过 exit 0，任一失败 exit 1。
- `package.json` 新增一行脚本 `"test:e2e:interactions": "python3 tests/e2e/interactions.py"`，不修改现有 `test:e2e`。

## 不做的事

- 不修改 `src/` 下任何文件，不新增测试属性，不调整路由与文案。
- 不接入 CI 工作流。
