
# 目标

搭建完整的账户系统，让 Kindred 从"演示 demo"过渡到"有真实用户身份"的产品首版。范围包括：注册、登录、登出、Google/Apple 社交登录、WeChat 占位、邀请码门槛、以及登录后与现有 Profile / History / Saved 的衔接（前端演示层，不动后台业务）。

# 一、用户流程

## 1. 未登录访客进入首页

- 首页仍可看到 Agent 介绍和输入框（保留"能看到产品是什么"的第一印象）。
- 任何**会产生私人数据**的动作（提交心愿、打开 Profile、打开 History、Saved、发送 Hello）都会触发一个轻量登录弹层，而不是直接跳走——保留上下文，登录后回到原动作。
- 页眉右上从"语言切换"变成"语言切换 + Sign in"。

## 2. 登录弹层（`/auth`，也可作为独立页）

单一页面，两种状态由 URL query 切换：`?mode=signin` / `?mode=signup`（默认 signin）。

内容自上而下：
- 标题 + 一句话说明（signin：欢迎回来 / signup：Kindred 目前仅限受邀加入）。
- **Continue with Google**（主按钮）
- **Continue with Apple**
- **Continue with WeChat**（灰态，右侧小字 `Coming soon`，点击 toast 提示）
- 分隔线 `or`
- Email + Password 表单
- 底部切换链接：`New here? Get an invite` / `Already have an account? Sign in`
- signup 模式下，Email/Password 表单**上方**多一个 `Invite code` 输入框（必填）。社交登录按钮在 signup 模式下也会先校验邀请码：若未填，点按钮时用红色提示要求先填。

## 3. 邀请码规则

- 每个已登录用户在 Profile 页多一个 "Invites" 板块：显示自己剩余的可用邀请码数量（首版默认给每人 3 个），可点击生成一个新的 8 位字母数字码，一键复制。
- 码由字母数字组成，单次使用；被使用后从生成者的额度里扣掉一个。
- 校验时机：signup 提交时校验；无效/已用/过期给出明确错误。
- 首批种子用户（比如"admin"账户）通过后台预置。首版前端只需要暴露"生成 / 复制 / 显示剩余额度"三个动作。

## 4. 注册后

- 落到 Profile 页（复用现在的 `/profile`），顶部一条一次性欢迎横幅："Welcome to Kindred. Fill in the basics so we can introduce you to the right people." 引导完成 Vitals。
- 首次登录时把当前 localStorage 里的匿名数据"认领"给这个账号（本地绑定 userId 命名空间即可，后端由你处理）。

## 5. 已登录状态

- 页眉右上角原本的 History/Saved/Connections 图标仍在；最右边新增账户头像按钮，点开下拉菜单：
  - 用户名 + 邮箱（灰色只读一行）
  - `Your profile` → `/profile`
  - `Invites (剩余 N)` → 展开生成/复制
  - `Sign out`
- 未登录时头像位置显示 `Sign in` 文本按钮。

## 6. 登出

- 点击 `Sign out` → 清空登录态 → 跳回 `/`（保留 localStorage 里那些"演示数据"以便下次任何用户登录都能看到 demo 内容；这是演示层的取舍）。

## 7. 忘记密码

首版极简：email 表单下面一行 `Forgot password?` → 跳 `/reset-password`，UI 占位（输入邮箱 → 显示"我们会给你发链接"toast），实际邮件发送由你在后台接入。同样地 `/reset-password?type=recovery` 支持设置新密码的 UI。

# 二、前端演示层实现范围

我只做前端 UI + 一个可插拔的"假登录"层（`src/lib/auth.ts`），后台真实接入你来处理。假登录层负责：
- 用 localStorage 存 `kindred:auth.v1 = { userId, email, name, avatar, provider, invitesLeft }`。
- 提供 `useAuth()` hook：`{ user, signIn, signUp, signOut, generateInvite }`。
- `signIn/signUp` 均返回 Promise，模拟 800ms 延迟；signup 时校验邀请码来自内置白名单（例如 `KINDRED2026`）或已生成集合。
- 页眉、登录弹层、Profile 全部读这一层；未来你替换 `src/lib/auth.ts` 的实现即可对接真实后端。

# 三、文件改动

新增：
- `src/lib/auth.ts` — 假登录 store（localStorage） + hook。
- `src/lib/invites.ts` — 邀请码生成、校验、消费。
- `src/routes/auth.tsx` — Sign in / Sign up 页面（一页两态）。
- `src/routes/reset-password.tsx` — 忘记密码 / 设置新密码占位。
- `src/components/auth-required-dialog.tsx` — 未登录动作触发的轻弹层（其实就是 push to `/auth` 并保存 `redirect` 搜索参数）。
- `src/components/account-menu.tsx` — 页眉右侧头像下拉。

修改：
- `src/components/workspace-header.tsx` — 加 `<AccountMenu />` 或 `Sign in` 按钮。
- `src/components/home.tsx` — 首页提交时若未登录 → 跳 `/auth?redirect=...`。
- `src/routes/profile.tsx`、`src/routes/connections.tsx`、`src/routes/sessions.tsx`、`src/routes/side-by-side.tsx`、`src/routes/matchmaker.tsx` — 页面入口加登录护栏（未登录跳 `/auth?redirect=当前路径`）。
- `src/components/profile-form.tsx` — 底部加 `Invites` 板块。
- `src/locales/en/common.json`、`src/locales/zh-CN/common.json` — 加 auth / invites 相关文案。

# 四、技术要点（给你后端对接时参考）

- 三个社交按钮在演示层里都走同一个 `signIn(provider)`；未来接入 Lovable Cloud 时，Google/Apple 通过 `supabase.auth.signInWithOAuth`，WeChat 走自定义 server route（`src/routes/api/public/wechat-callback.ts`）+ 自签 Supabase session。
- `redirect_uri` 使用 `window.location.origin`，不要指向受保护路径。
- 登录弹层永远是**顶级公共路由**，不要放在 `_authenticated/` 下（否则回跳时会闪回登录页）。
- 邀请码表未来在 Supabase 里应长这样：`invite_codes (code text pk, created_by uuid, used_by uuid null, expires_at, created_at)`，前端把 code 当字符串处理即可。

# 五、非目标（首版明确不做）

- WeChat 真实登录（灰态占位）。
- 双因素、手机号、SSO。
- 邀请码分级/带角色。
- 头像通过第三方存储上传（现在仍是 data URL 本地保存）。
- 后端真实持久化（你已明确自己处理）。

# 六、验收清单

1. 未登录访客点首页输入框提交 → 跳 `/auth`，登录后回到首页并保留输入。
2. 从 `/auth?mode=signup` 使用有效邀请码 + Google/Apple/邮箱都能完成注册，直达 `/profile` 并看到欢迎条。
3. WeChat 按钮点击后仅弹提示，不引发任何跳转。
4. Profile 页显示剩余邀请数，点 `Generate` 出现新码并可复制。
5. 页眉头像下拉可跳 Profile、生成邀请、登出；登出后回到 `/`，再点保护路径会重新跳 `/auth`。
6. 忘记密码走到 `/reset-password` 且 UI 占位不报错。
