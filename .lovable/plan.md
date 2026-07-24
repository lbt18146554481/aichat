## 目标

第一版去掉邮箱注册/登录，登录只留 Google、Apple、WeChat（占位）。新用户必须先输入有效邀请码才能看到注册入口——邀请码作为**先验**关卡，OAuth 之后不再校验。同时修掉当前 `/auth` 无限嵌套 `redirect=` 的 bug，把所有相关流程理顺。

## 一、最终流程

### 未登录用户
- 页眉右上显示 `Sign in`。首页可浏览，但任何私人动作 → `/auth?mode=signin&redirect=<返回路径>`。
- `/auth?mode=signin`：只展示 `Continue with Google` / `Continue with Apple` / `Continue with WeChat (Coming soon)`。底部一行 `New to Kindred? Join with an invite →` 跳 `/auth?mode=signup`。
- `/auth?mode=signup` 分**两步**：
  1. **Step 1 — Invite code**：一个大输入框 + `Continue` 按钮。校验通过（`validateInvite`，但**不消耗**）才进入 Step 2；无效/已用则红字提示，允许重试。
  2. **Step 2 — Choose provider**：显示三枚 OAuth 按钮 + 顶部一行只读的已验证码芯片 `Invite ✓ ABCD1234`（可点 `Change` 回 Step 1）。点 OAuth 成功后再 `consumeInvite`，然后落 `/profile?welcome=1`。
- WeChat 按钮始终 toast 提示 `Coming soon`，不产生跳转。

### 已登录用户
- 直接访问 `/auth` → 立即跳回 `redirect` 或 `/`。
- 头像下拉里的 `Invites` 面板照旧（生成/复制/剩余额度）。

### 忘记密码
- 邮箱登录已删，`/reset-password` 不再有意义，直接删除该路由 + `Forgot password?` 链接。

### 登出
- 与现状一致：`signOut()` → 回 `/`。

## 二、Bug：`/auth?redirect=%2Fauth%3F...` 无限嵌套

`useRequireAuth` 用 `location.href` 拼 `redirect`，而 `safeRedirect` 又接受任何 `/…`，一旦某处再触发一次守卫（例如 SPA 内快速切页时 `/auth` 短暂命中受保护路由），`redirect` 里的 `redirect` 就会被再次编码套一层，累积成当前 URL。修复：

- `auth-guard.ts`：改用 `location.pathname + location.search`；若当前已在 `/auth` 则直接返回不再重定向。
- `auth.tsx` 的 `safeRedirect`：拒绝任何以 `/auth` 开头的目标（回退到 `/`），并把"已登录自动跳转"从 render 期挪到 `useEffect`（现在是在 render 里调 `navigate`，可能重复入栈）。
- `account-menu.tsx`：`redirect` 参数继续用 `location.pathname`（现状 OK，无需改）。

## 三、代码改动

**修改 `src/lib/auth.ts`**
- 收窄 `AuthProvider` 语义：仍是 `"google" | "apple" | "wechat" | "email"`，但对外只导出/使用前三者；`email` 保留为内部字面量以兼容旧存储读取。
- 删除 `SignInInput.email/password`、`SignUpInput.email/password/name`。
- `signIn({ provider })`：若 `loadUser()` 返回空，抛 `account_not_found` 错误（提示先走 signup）。已存在则返回 existing user（demo 单账户槽）。
- `signUp({ provider, inviteCode })`：先 `validateInvite`（不消耗）→ OAuth 模拟成功 → 再 `consumeInvite`。任一步失败均不消耗邀请码。

**修改 `src/lib/invites.ts`**
- 无逻辑改动。（`validateInvite` 已存在。）

**修改 `src/routes/auth.tsx`**
- 删除所有邮箱/密码/姓名 input、`handleEmail`、`Forgot password?` 链接。
- 引入本地 state `step: "invite" | "provider"`（仅 signup 有意义；signin 直接是 provider 步）。
- Step 1 UI：邀请码输入 + `Continue` 按钮 + 错误提示。
- Step 2 UI：`Invite ✓ CODE (Change)` chip + 三个 provider 按钮。
- `handleProvider` 在 signup 分支里传已验证的 `inviteCode`；signin 分支捕获 `account_not_found` → 提示并给一个跳 signup 的按钮。
- `signed-in 自动跳转`挪到 `useEffect`；`safeRedirect` 增加 `/auth` 前缀过滤。
- `head()` 保留。

**修改 `src/lib/auth-guard.ts`**
- `redirect` 用 `location.pathname + location.search`；若 pathname 已是 `/auth` 则不重定向（避免嵌套）。

**删除 `src/routes/reset-password.tsx`**
- 路由树会自动重生成；同时移除 `common.json` 里 `auth.forgot_password` / `reset.*` 相关键（若无外部引用）。

**修改 `src/locales/en/common.json` 与 `zh-CN/common.json`**
- 移除：`auth.email_placeholder` / `auth.password_placeholder` / `auth.name_placeholder` / `auth.submit_signin` / `auth.submit_signup` / `auth.forgot_password` / `auth.err.email_password_required` / `reset.*`。
- 新增：
  - `auth.invite_step_title`（"先输入邀请码"）
  - `auth.invite_step_sub`（"Kindred 目前仅限受邀加入，输入你的邀请码继续。"）
  - `auth.invite_verify`（`Continue`）
  - `auth.invite_change`（`Change`）
  - `auth.invite_verified`（`Invite ✓ {{code}}`）
  - `auth.err.invite_invalid`（"邀请码无效或已被使用"）
  - `auth.err.account_not_found`（"还没有账号？用邀请码加入。"）
  - `auth.provider_step_title_signup`（"选择注册方式"）

**修改 `src/components/home.tsx` 等触发登录处**
- 保持现状（跳 `/auth?mode=signin&redirect=...`）；`safeRedirect` 改动后即可断掉嵌套。

## 四、非目标（本次不做）

- 真实后端接入 / Lovable Cloud。
- 邮箱魔法链接、手机号、SSO。
- 邀请码分角色/分级。
- WeChat 真实登录。

## 五、验收清单

1. `/auth?mode=signin` 无邮箱/密码字段，只有三枚 provider + 一条 "Join with an invite"。
2. `/auth?mode=signup` 先要求邀请码；未通过校验时点 provider 不生效（其实按钮压根没渲染）。
3. 用无效码点 `Continue` → 红字提示 + 邀请码保留；用有效码 → 进入 Step 2，`Invite ✓ CODE` 可见，可点 `Change` 回退。
4. Step 2 完成 Google/Apple 登录 → 邀请码被消耗（`listMyCodes` 中 `usedBy` 更新）→ 落 `/profile?welcome=1`。
5. 未注册状态直接在 signin 步点 Google → 提示 `account_not_found` 并给出跳 signup 的入口。
6. WeChat 按钮点击只 toast，不跳。
7. 从 `/profile` 未登录被拦截 → `/auth?redirect=/profile`；登录后回 `/profile`；地址栏**不会**出现二次编码的 `redirect=%2Fauth...`。
8. 已登录时访问 `/auth` → 立刻跳走，不刷屏。
9. `/reset-password` 返回 404（或不存在于路由树）。