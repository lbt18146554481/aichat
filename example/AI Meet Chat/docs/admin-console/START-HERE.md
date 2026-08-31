# maitri-admin 开局文档（粘贴即可开工）

> 用法：Lovable 首页 → New Project → 命名 `maitri-admin` → 把本文件**全文**作为第一条消息发送。
> 需要字段级细节时，再补发同目录的 `spec.md`。
> 本文件是唯一权威开局说明；`bootstrap-prompt.md` 已收敛为指向本文件。

---

## 项目定位与硬边界

请搭建一个**后台管理系统**（Maitri Admin Console），用于管理一款社交撮合 Agent 产品的用户、数据统计、邀请码，以及后台自身的账号与权限。

技术栈固定：TanStack Start + Tailwind v4 + shadcn。

硬边界（首版必须遵守）：

- **不要启用 Lovable Cloud，不要建数据库、不要写迁移。** 全部数据来自项目内部 mock 适配器（内存 + 固定种子数据）。
- 这是一个**完全独立**的项目，不读取、不依赖任何外部产品的浏览器存储或接口。
- 首版目标是**模块骨架且可点可用**：每个页面能进、能筛、能操作、操作有反馈并落审计记录。

## 分层纪律（硬要求）

```text
src/data/ports/            领域类型 + 7 个 Repos 接口，方法全部返回 Promise
src/data/adapters/mock/    首版实现（内存）
src/data/adapters/mock/seed/  种子数据，独立目录，接真库时整目录删除
src/data/adapters/remote/  下一版：createServerFn / 真实库
src/data/hooks/            TanStack Query 封装，页面只从这里取数
src/data/index.ts          单一装配点，一行切换适配器
src/auth/                  会话 + useCan(permission) / assertCan(permission)
src/features/users|stats|invites|admins|roles|audit/   各模块 UI
```

规则：

- 7 个 Repos：`auth` / `users` / `stats` / `invites` / `accounts` / `roles` / `audit`。
- 页面与组件**只**从 `src/data/hooks` 取数，绝不 import 适配器或 seed。
- 所有列表方法从第一版起就带 `PageQuery { page, pageSize, sort, search, filters }` 并返回 `Page<T>`，避免接真实接口时改所有调用点。
- 权限判定两份同构调用：UI 层 `useCan()`；数据层 `assertCan()`，越权抛 `ForbiddenError`。首版 `assertCan` 在 mock 适配器内执行，接真库后原样搬到服务端中间件，页面不改。

## 权限模型

13 个权限点：

```text
users:read    users:write   users:ban    users:delete
stats:read    stats:export
invites:read  invites:write invites:revoke
admins:read   admins:write
roles:write
audit:read
```

预设角色（可编辑、可新增）：

- `super_admin`：全部权限点，唯一可用 `roles:write` / `admins:write`
- `ops`：`users:read|write|ban` + `invites:*` + `stats:read`
- `support`：`users:read` + `stats:read`（只读）

防锁死规则：

- 系统必须始终保留至少一个**启用中**的 `super_admin`。
- 不能对自己降权 / 停用 / 删除。
- 删除角色前必须把成员迁移到其他角色。

UI 表现：无权限的菜单项不渲染；无权限的按钮 `disabled` 并用 tooltip 说明原因。

## 路由

`/login` 公开；其余全部在 `_authenticated/` 网关内：

```text
/login              后台登录（邮箱 + 密码，首版 mock）
/                   概览仪表盘
/users              用户列表
/users/$id          用户详情
/stats              数据统计
/invites            邀请码
/settings/admins    后台账号
/settings/roles     角色与权限点
/settings/audit     操作审计日志
```

每个页面各自 `head()`，title 与 description 互不相同，不要出现 "Lovable App" 之类占位文案。

## 各模块首版范围

**用户**：列表列为头像、名称、城市、注册时间、最近活跃、心愿数、连接数、状态；支持搜索、筛选（状态 / 城市 / 注册时间段 / 是否完成资料）、排序、分页。详情页展示资料、心愿、匹配、连接、举报；操作为封禁 / 解封（原因必填）、重置资料可见性、删除（二次确认需输入用户名）。

**统计**：概览卡 7 项（总用户、今日新增、7 日活跃、心愿总数、匹配成功数、匹配成功率、邀请码使用率）；趋势图（注册 / 心愿发布 / 匹配成交，日 / 周切换）；分布图（城市 / 运动类别 / 时间档位）；CSV 导出受 `stats:export` 控制。

**邀请码**：批量生成（数量、备注、有效期、归属人）；列表显示码、创建人、状态（未用 / 已用 / 已失效 / 过期）、使用者、时间；操作为复制、批量导出、失效。

**后台账号与角色**：邀请成员（邮箱 + 角色）、停用、强制下线；角色编辑用权限点复选矩阵。

**审计**：只读列表，字段为 who / when / action / target / reason / result；可按操作人、资源类型、时间段筛选。**所有写操作都必须落审计记录。**

## 视觉

后台风格，紧凑的数据密度，清晰的表格与状态色。所有颜色、阴影为语义 token，定义在 `src/styles.css`，组件内不要硬编码 `text-white` / `bg-black` / `bg-[#...]`。不要紫蓝渐变加白底那套通用 AI 审美，选一个克制、专业的方向并贯穿全站。

## 验收清单

1. 三种预设角色分别登录：菜单可见性正确，无权按钮禁用且有原因说明。
2. 直接调用越权的数据层方法被 `assertCan` 拒绝（抛 `ForbiddenError`）。
3. 九个路由页面全部可进、可用，列表的搜索 / 筛选 / 排序 / 分页真实生效。
4. 每一次写操作都在 `/settings/audit` 有对应记录。
5. 页面与组件中不存在对 `src/data/adapters/*` 的直接 import。
6. `lint` 无 error，`build:dev` 成功。

---

## 后续消息序列（每条一句话即可推进）

```text
消息 1  骨架 + 数据层（ports/adapters/mock/hooks/index）+ 权限 + /login + 概览
消息 2  用户列表与详情，含封禁 / 解封 / 重置可见性 / 删除，全部落审计
消息 3  统计页：7 张概览卡 + 趋势图（日 / 周）+ 分布图 + CSV 导出
消息 4  邀请码：批量生成、状态列表、复制、批量导出、失效
消息 5  后台账号与角色权限矩阵 + 审计日志页（含筛选）
消息 6  以 super_admin / ops / support 三角色走查验收清单并修正
```

## 未来接入真实后端

两侧共用同一后端时的切换路径（首版不做）：

1. 后台侧实现 `src/data/adapters/remote/index.ts` 导出 `remoteRepos: Repos`，`src/data/index.ts` 改一行。
2. Agent 产品侧同样把 `src/data/index.ts` 从 `local` 切到 `remote`。
3. `assertCan` 从 mock 适配器搬到服务端中间件。
4. 两侧页面、样式、交互均不需要改动。

需要建库时，表与字段以 `spec.md` 的数据契约为准：`users / profiles / intents / matches / connections / invites / reports` + `admin_users / admin_roles / admin_role_permissions / audit_logs`。
