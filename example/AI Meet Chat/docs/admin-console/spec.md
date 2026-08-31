# Maitri Admin Console — 需求与接口契约

> 本文件是**独立后台管理项目**的落地依据。当前 Agent 产品（Web + iOS）不因本文件产生任何代码、交互或视觉改动。
> 后台首版只做骨架：数据来自后台项目内部的 mock 适配器，不启用 Cloud、不建业务库、不读当前产品的浏览器本地存储。

---

## 1. 项目定位与边界

| 项 | 约定 |
| --- | --- |
| 代码仓 | 全新独立 Lovable 项目（`maitri-admin`），独立部署与域名（如 `admin.*`） |
| 与主产品关系 | 首版零耦合；下一版通过共享后端读同一份数据 |
| 技术栈 | TanStack Start + Tailwind v4 + shadcn（与主产品一致，便于维护，但代码完全独立） |
| 首版数据源 | `src/data/adapters/mock/`（内存 + 固定种子） |
| 首版模块 | 登录、概览、用户管理、数据统计、邀请码管理、后台账号/角色、审计日志 |

主产品侧的不变量（本次不得触碰）：`src/routes/*`、`src/components/*`、`native/*`、`src/styles.css`、文案与路由。

---

## 2. 权限模型（细粒度权限点）

### 2.1 权限点清单

```text
users:read       查看用户列表与详情
users:write      编辑用户资料字段、重置资料可见性
users:ban        封禁 / 解封用户
users:delete     删除用户账号（不可逆）

stats:read       查看统计概览与图表
stats:export     导出 CSV

invites:read     查看邀请码列表与使用情况
invites:write    生成邀请码（含批量）
invites:revoke   失效邀请码

admins:read      查看后台账号
admins:write     邀请 / 停用 / 强制下线后台账号
roles:write      创建与编辑角色、调整权限点

audit:read       查看操作审计日志
```

### 2.2 预设角色（可编辑、可新增）

| 角色 | 权限点 |
| --- | --- |
| `super_admin` | 全部；唯一可持有 `roles:write`、`admins:write` |
| `ops` | `users:read` `users:write` `users:ban` `invites:*` `stats:read` |
| `support` | `users:read` `stats:read`（只读） |

### 2.3 判定纪律（两处同构）

- UI 层：`useCan("users:ban")` → 无权限的菜单项不渲染；无权限的按钮 `disabled` 并给出原因 tooltip。
- 数据层：每个写方法首行 `assertCan("users:ban")`，越权抛 `ForbiddenError`。
  首版 `assertCan` 在 mock 适配器内执行；接真实后端后同一函数搬到服务端中间件，**页面代码不改**。
- 防锁死：`super_admin` 不能对自己降权、停用或删除；系统至少保留一个启用中的 `super_admin`。

---

## 3. 页面清单

```text
/login                     后台登录（邮箱 + 密码，首版 mock 校验）
/                          概览仪表盘
/users                     用户列表（搜索 / 筛选 / 排序 / 分页）
/users/:id                 用户详情（资料、心愿、匹配、连接、举报、操作）
/stats                     数据统计
/invites                   邀请码（列表 / 批量生成 / 失效 / 使用追踪）
/settings/admins           后台账号管理
/settings/roles            角色与权限点配置
/settings/audit            操作审计日志
```

路由结构：`/login` 为公开路由；其余全部位于 `_authenticated/` 网关内。

### 3.1 用户管理

- 列表列：头像、名称、城市、注册时间、最近活跃、心愿数、连接数、状态（正常 / 已封禁 / 已删除）。
- 筛选：状态、城市、注册时间段、是否完成资料。搜索：名称 / 邮箱 / 用户 ID。
- 详情页操作：
  - 封禁 / 解封 —— 原因必填。
  - 重置资料可见性 —— 恢复默认可见性设置。
  - 删除账号 —— 二次确认，需手动输入用户名。
- 所有写操作写入审计日志（含原因与结果）。

### 3.2 数据统计

- 概览卡：总用户、今日新增、7 日活跃、心愿总数、匹配成功数、匹配成功率、邀请码使用率。
- 趋势图：注册数、心愿发布数、匹配成交数；按日 / 周切换。
- 分布图：城市、运动类别、时间档位（when tier）。
- 导出：CSV，受 `stats:export` 控制。

### 3.3 邀请码管理

- 批量生成：数量、备注、有效期、归属人。
- 列表：码、创建人、状态（未用 / 已用 / 已失效 / 已过期）、使用者、创建时间、使用时间。
- 操作：复制单条、批量导出、失效。

### 3.4 后台账号与角色

- 账号：邮箱邀请、指定角色、停用、强制下线（吊销会话）。
- 角色：权限点复选矩阵；展示每个角色的成员数；删除角色前必须迁移成员。

### 3.5 审计日志

只读。字段：操作人、时间、动作、目标资源类型 + ID、原因、结果（成功 / 失败）。支持按操作人、资源类型、时间段筛选。

---

## 4. 目录结构与分层纪律

```text
src/routes/                       页面（公开 /login + _authenticated 网关内页）
src/features/users/               每模块自带列表、详情、表单组件
src/features/stats/
src/features/invites/
src/features/admins/
src/features/roles/
src/features/audit/
src/data/ports/                   全异步接口 + 领域类型（契约）
src/data/adapters/mock/           首版实现：内存仓储
src/data/adapters/mock/seed/      种子数据（接真库时整目录删除）
src/data/adapters/remote/         下一版：createServerFn / 真实后端
src/data/hooks/                   UI 唯一数据入口（TanStack Query）
src/data/index.ts                 单一装配点：一行切换适配器
src/auth/                         会话、useCan / assertCan
```

纪律：

1. 页面与组件只 import `@/data/hooks`，绝不直接 import 适配器。
2. 端口方法**全部返回 Promise**，从第一版起就带分页 / 排序 / 筛选参数，避免接真接口时改调用点。
3. 领域计算（统计聚合、状态推导）为纯函数，接收数据参数，不读存储。

---

## 5. 端口签名（契约）

```ts
// ---------- 通用 ----------
export interface PageQuery<F = Record<string, unknown>> {
  page: number;          // 1-based
  pageSize: number;
  sort?: { field: string; dir: "asc" | "desc" };
  search?: string;
  filters?: F;
}
export interface Page<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}
export type Unsubscribe = () => void;
export class ForbiddenError extends Error {}

// ---------- 权限 ----------
export type Permission =
  | "users:read" | "users:write" | "users:ban" | "users:delete"
  | "stats:read" | "stats:export"
  | "invites:read" | "invites:write" | "invites:revoke"
  | "admins:read" | "admins:write" | "roles:write"
  | "audit:read";

// ---------- 后台会话 ----------
export interface AdminSession {
  adminId: string;
  email: string;
  name: string;
  roleId: string;
  permissions: Permission[];
}
export interface AdminAuthRepo {
  current(): Promise<AdminSession | null>;
  signIn(input: { email: string; password: string }): Promise<AdminSession>;
  signOut(): Promise<void>;
  subscribe(fn: (s: AdminSession | null) => void): Unsubscribe;
}

// ---------- 用户 ----------
export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  avatar: string;
  city: string;
  status: "active" | "banned" | "deleted";
  createdAt: number;
  lastActiveAt: number | null;
  profileComplete: boolean;
  intentCount: number;
  connectionCount: number;
}
export interface AdminUserDetail extends AdminUserRow {
  profile: Record<string, unknown>;   // 主产品 Profile 的只读投影
  intents: Array<{ id: string; kind: string; when?: string; level?: string; city?: string; status: string; createdAt: number }>;
  matches: Array<{ id: string; peerId: string; peerName: string; matchedAt: number }>;
  connections: Array<{ peerId: string; peerName: string; state: string; lastMessageAt: number | null }>;
  reports: Array<{ id: string; byUserId: string; reason: string; at: number }>;
}
export interface UsersFilters {
  status?: AdminUserRow["status"];
  city?: string;
  createdFrom?: number;
  createdTo?: number;
  profileComplete?: boolean;
}
export interface AdminUsersRepo {
  list(q: PageQuery<UsersFilters>): Promise<Page<AdminUserRow>>;
  get(id: string): Promise<AdminUserDetail | null>;
  ban(id: string, reason: string): Promise<void>;
  unban(id: string, reason: string): Promise<void>;
  resetVisibility(id: string): Promise<void>;
  remove(id: string, reason: string): Promise<void>;
}

// ---------- 统计 ----------
export interface StatsOverview {
  totalUsers: number;
  newUsersToday: number;
  activeUsers7d: number;
  totalIntents: number;
  totalMatches: number;
  matchRate: number;         // 0..1
  inviteUsageRate: number;   // 0..1
}
export type Bucket = "day" | "week";
export interface SeriesPoint { at: number; value: number }
export interface Distribution { key: string; label: string; value: number }
export interface AdminStatsRepo {
  overview(): Promise<StatsOverview>;
  series(input: { metric: "signups" | "intents" | "matches"; bucket: Bucket; from: number; to: number }): Promise<SeriesPoint[]>;
  distribution(input: { dimension: "city" | "activityKind" | "whenTier" }): Promise<Distribution[]>;
  exportCsv(input: { report: "overview" | "signups" | "intents" | "matches"; from: number; to: number }): Promise<string>;
}

// ---------- 邀请码 ----------
export interface AdminInviteRow {
  code: string;
  createdBy: string;         // admin id / user id / "seed"
  createdByLabel: string;
  note: string | null;
  status: "unused" | "used" | "revoked" | "expired";
  usedBy: string | null;
  usedByLabel: string | null;
  createdAt: number;
  usedAt: number | null;
  expiresAt: number | null;
  ownerUserId: string | null;
}
export interface InvitesFilters { status?: AdminInviteRow["status"]; createdBy?: string }
export interface AdminInvitesRepo {
  list(q: PageQuery<InvitesFilters>): Promise<Page<AdminInviteRow>>;
  generate(input: { count: number; note?: string; expiresAt?: number; ownerUserId?: string }): Promise<AdminInviteRow[]>;
  revoke(codes: string[], reason: string): Promise<void>;
  exportCsv(q: PageQuery<InvitesFilters>): Promise<string>;
}

// ---------- 后台账号与角色 ----------
export interface AdminAccountRow {
  id: string;
  email: string;
  name: string;
  roleId: string;
  roleName: string;
  status: "active" | "disabled";
  createdAt: number;
  lastLoginAt: number | null;
}
export interface AdminRole {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
  system: boolean;           // 预设角色标记
  memberCount: number;
}
export interface AdminAccountsRepo {
  list(q: PageQuery): Promise<Page<AdminAccountRow>>;
  invite(input: { email: string; name: string; roleId: string }): Promise<AdminAccountRow>;
  setRole(id: string, roleId: string): Promise<void>;
  disable(id: string, reason: string): Promise<void>;
  enable(id: string): Promise<void>;
  revokeSessions(id: string): Promise<void>;
}
export interface AdminRolesRepo {
  list(): Promise<AdminRole[]>;
  create(input: { name: string; description: string; permissions: Permission[] }): Promise<AdminRole>;
  update(id: string, patch: { name?: string; description?: string; permissions?: Permission[] }): Promise<void>;
  remove(id: string, migrateToRoleId: string): Promise<void>;
}

// ---------- 审计 ----------
export interface AuditLogRow {
  id: string;
  at: number;
  actorId: string;
  actorLabel: string;
  action: string;                       // "users:ban" 等
  targetType: "user" | "invite" | "admin" | "role";
  targetId: string;
  reason: string | null;
  result: "success" | "failure";
}
export interface AuditFilters { actorId?: string; targetType?: AuditLogRow["targetType"]; from?: number; to?: number }
export interface AuditRepo {
  list(q: PageQuery<AuditFilters>): Promise<Page<AuditLogRow>>;
  record(entry: Omit<AuditLogRow, "id" | "at" | "actorId" | "actorLabel">): Promise<void>;
}

// ---------- 装配 ----------
export interface AdminRepos {
  auth: AdminAuthRepo;
  users: AdminUsersRepo;
  stats: AdminStatsRepo;
  invites: AdminInvitesRepo;
  accounts: AdminAccountsRepo;
  roles: AdminRolesRepo;
  audit: AuditRepo;
}
```

---

## 6. 数据字段契约（将来建库依据）

### 6.1 主产品侧（后台只读，个别字段可写）

| 表 | 关键字段 |
| --- | --- |
| `users` | `id`、`email`、`provider`、`status`、`created_at`、`last_active_at`、`banned_at`、`ban_reason` |
| `profiles` | `user_id`、`name`、`avatar_url`、`city`、`gender`、`orientation`、`mbti`、`bio`、`favorites(jsonb)`、`activity_kinds(text[])`、`visibility(jsonb)`、`updated_at` |
| `intents` | `id`、`user_id`、`kind`、`raw_text`、`when_tier`、`level_tier`、`city`、`location`、`status`、`created_at`、`revoked_at` |
| `matches` | `id`、`intent_a`、`intent_b`、`user_a`、`user_b`、`score`、`matched_at` |
| `connections` | `id`、`user_id`、`peer_id`、`state`、`origin_session_id`、`last_message_at`、`created_at` |
| `invites` | `code`(pk)、`created_by`、`owner_user_id`、`note`、`used_by`、`created_at`、`used_at`、`revoked_at`、`expires_at` |
| `reports` | `id`、`by_user_id`、`target_user_id`、`reason`、`detail`、`created_at`、`handled_at`、`handled_by` |

### 6.2 后台自有表

| 表 | 关键字段 |
| --- | --- |
| `admin_users` | `id`、`email`(uniq)、`name`、`role_id`、`status`、`created_at`、`last_login_at` |
| `admin_roles` | `id`、`name`(uniq)、`description`、`system`、`created_at` |
| `admin_role_permissions` | `role_id`、`permission`，唯一约束 `(role_id, permission)` |
| `audit_logs` | `id`、`at`、`actor_id`、`action`、`target_type`、`target_id`、`reason`、`result`、`meta(jsonb)` |

建库时的硬要求（与主产品同一套规矩）：

- 角色与权限点**只存在独立表**里，绝不写在 `admin_users` 的可自改字段上。
- 每个 `CREATE TABLE public.*` 之后立即写 `GRANT`，再 `ENABLE ROW LEVEL SECURITY`，再 `CREATE POLICY`。
- 权限判定走 `security definer` 函数（如 `admin_has_permission(_admin_id, _permission)`），避免 RLS 递归。
- 后台表不对 `anon` 授权。

---

## 7. 与主产品的对接路线（下一版）

1. 主产品启用 Cloud，按 §6.1 建库并迁移；主产品把 `src/data/index.ts` 从 `local` 切到 `remote`（一行）。
2. 后台落地 `src/data/adapters/remote/`，读同一后端；删除 `adapters/mock/seed/`。
3. 后台 `assertCan` 从 mock 层搬到服务端中间件。
4. 两侧页面、样式、文案、交互均不改动。

---

## 8. 验收标准

主产品（本仓）：`lint`、`build:dev`、单测、e2e、原生隔离校验结果与改动前一致；`src/`、`native/` 无任何 diff。

后台项目：

- 三种预设角色分别登录：菜单可见性正确、无权按钮禁用并有原因、直接调用越权方法被 `assertCan` 拒绝。
- 七个模块页面全部可点可用，列表具备搜索 / 筛选 / 排序 / 分页。
- 所有写操作在 `/settings/audit` 产生对应记录（含原因与结果）。
- 无法把系统里最后一个 `super_admin` 降权、停用或删除。
