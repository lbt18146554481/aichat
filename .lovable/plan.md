## 目标
1. 删除首页底部的 "So the Agents can introduce you too — set up profile · 0/3" 提示。
2. 审视首次登录后的 Profile 初始化流程，判断是否需要优化，并给出结论与最小改动。

## 现状梳理
- 首页 `src/components/home.tsx` 在资料未完成时渲染 `home.profile_nudge` + `home.profile_nudge_cta`（就是那条 0/3 文字）。
- 注册成功后，`src/routes/auth.tsx` 的 `finishAfterAuth(true)` 已经将新用户直接跳到 `/profile?welcome=1`（除非用户是从别处被拦截过来的，会回原来的路径）。
- `/profile` 页面本身已有 `heading_setup`、`subhead`、`progress (done/total)` 三件套，是一个完整的引导页。
- 用户在使用 Matchmaker / Side-by-Side 提交心愿时，若资料不全（例如缺城市），`src/routes/profile.tsx` 已经有 `kindred:profile:return` + `kindred:profile:focus` 的“按需回填”跳转机制。

## 结论：流程不需要再增加提示，反而应删繁就简
现在的问题不是缺提醒，而是重复提醒 + 时机错位：
- 注册后已经强制进入 `/profile`——用户已经知道要填资料。
- 真正需要用到城市/资料时，系统会自动把用户带回 `/profile` 并高亮所需字段。
- 首页那条 0/3 文字属于"永久性未完成状态提示"，噪声大、价值低（用户随时可从右上角头像/Profile 入口进入），删除即可，不需要用其他形式替代。

## 变更清单

### 1. 首页删除资料提示
文件：`src/components/home.tsx`
- 删除 `!profileReady` 的整段 nudge JSX（约 193–204 行）。
- 顺带清理不再使用的 state / imports：
  - `profileReady`、`progress` state 与其 setter 调用；
  - `isProfileComplete`、`profileProgress` 的 import；
  - `loadProfile` 若不再被使用则一并移除。

### 2. 首次注册跳转体验的小打磨（保持简洁）
文件：`src/routes/profile.tsx`
- 读取 URL 上的 `welcome=1` 参数（`useSearch`）：
  - 当 `welcome=1` 时，页面顶部返回按钮改为“稍后再填 / Skip for now”，点击直接回首页；
  - 副标题在欢迎态下使用一句更友好的欢迎语（新增 i18n key `profile.welcome_sub`），非欢迎态维持原文案；
  - 完成 3/3 时自动移除 `welcome` 参数，避免二次进入仍显示欢迎态。
- 需要在 `createFileRoute` 上加 `validateSearch` 处理 `welcome`。

### 3. i18n
`src/locales/en/common.json` 与 `src/locales/zh-CN/common.json`：
- 删除 `home.profile_nudge`、`home.profile_nudge_cta`。
- 新增 `profile.welcome_sub`、`profile.skip_for_now`。

## 不做的事
- 不新增“完成 X 步解锁 Y”类进度奖励。
- 不做强制拦截式的资料引导 —— 需要资料的具体场景（如缺城市）已经有原生跳转，覆盖足够。
- 不改动 auth 完成后跳 `/profile?welcome=1` 的既有逻辑。

## 验收
- 未完成资料的账号首页不再出现 0/3 提示，页面更干净。
- 新用户注册后仍进入 `/profile`，顶部有明确的“稍后再填”出口；副标题呈现欢迎态。
- 已登录老用户从首页头像进入 `/profile`，页面外观与之前一致（非欢迎态）。
- Matchmaker / Side-by-Side 中因缺失字段回跳 `/profile` 的路径不受影响。