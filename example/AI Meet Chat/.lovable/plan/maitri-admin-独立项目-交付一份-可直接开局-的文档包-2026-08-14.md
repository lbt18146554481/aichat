# maitri-admin 独立项目：交付一份「可直接开局」的文档包

前提确认：后台是**完全独立的新 Lovable 项目**，由你在 Lovable 首页手动创建。我在本项目里只做一件事 —— 把新项目开局所需的文档准备到「粘贴即可开工」的程度。当前 Agent 产品的 `src/`、`native/`、样式与文案**零改动**。

## 现状

本仓已有两份文档：

- `docs/admin-console/spec.md` — 需求与接口契约（权限点、路由、Repos 签名、数据字段）
- `docs/admin-console/bootstrap-prompt.md` — 可粘贴的首条需求

问题在于：两份文档要同时粘贴、内容有重叠、且没有交付后的验收与第二/第三条消息的推进节奏，实际开局仍然容易跑偏。

## 本次要做的

### 1. 合并为单一开局文件

新增 `docs/admin-console/START-HERE.md`，一个文件即可粘贴，包含：

- 一段式项目定位与硬边界（不启用 Cloud、mock 数据、独立部署）
- 完整分层纪律（ports / adapters/mock / hooks / index 装配点 / auth）
- 13 个权限点与 3 个预设角色、防锁死规则
- 9 条路由与每页 `head()` 要求
- 五大模块的首版可用范围
- 视觉方向（后台风格、语义 token、拒绝通用 AI 审美）
- 验收清单

`spec.md` 保留为契约参考（字段级细节），`bootstrap-prompt.md` 收敛为指向 START-HERE 的一行说明，避免三份文档互相冲突。

### 2. 增加分批开局脚本

在 START-HERE 末尾附「后续消息序列」，每条一句话即可推进：

```text
消息 1  骨架 + 数据层 + 权限 + 登录 + 概览
消息 2  用户列表与详情（含封禁/删除/审计落库）
消息 3  统计（卡片/趋势/分布/CSV 导出）
消息 4  邀请码（批量生成/失效/导出）
消息 5  后台账号与角色矩阵 + 审计页
消息 6  三角色验收走查与修正
```

### 3. 增加接真实后端的切换说明

一节说明未来两侧如何对齐：当前产品启用 Cloud 后，后台落地 `adapters/remote`，本项目 `src/data/index.ts` 改一行由 `local` 切 `remote`，两侧页面与交互都不改。

## 边界

- 不新建、不修改任何 `src/`、`native/`、CI、样式文件。
- 不启用 Cloud，不写迁移。
- 不尝试代替你创建新项目（工具只能操作当前项目）。

## 交付后你的操作

1. Lovable 首页 → New Project → 命名 `maitri-admin`
2. 粘贴 `docs/admin-console/START-HERE.md` 全文作为第一条消息
3. 需要字段级细节时再补发 `docs/admin-console/spec.md`
4. 按「后续消息序列」逐条推进

## 验证

`lint` / `build:dev` / 30 项单测 / e2e / 原生隔离校验结果与改动前一致（仅新增 Markdown）。
