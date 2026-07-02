# 方案 C：最小门槛打招呼 + 渐进式 Profile 沉淀

## 核心决策（不再询问，直接定）

1. **Say hello 的唯一门槛 = 有名字**。其余字段都不阻塞发送。
2. **Profile 每个字段独立保存，随填随存**，不再要求"三段全填才算完成"。UI 用进度徽章鼓励，不用锁定按钮。
3. **等待对方回应期**是 Profile 补全的最佳时机，用一条不打扰的邀请引导。
4. **首页 nudge 保留**作为主动入口；`/profile` 独立路由保留作深链接。
5. **抽屉**只在用户"主动愿意补"的场景出现，从不阻塞主流程。

## 改动

### 1. `src/lib/profile.ts` — 语义调整

- 新增 `hasName(p): boolean` = `p.name.trim().length > 0`。这是 Say hello 的门槛。
- 保留 `isVitalsComplete` / `isProfileComplete` / `profileProgress`——但仅供进度徽章、Preview 卡显示用，不再是任何按钮的启用条件。
- 保留 `MIN_MOMENTS = 3` 作"完整"提示，但**不作强制**。
- `saveProfile` 逻辑不变（已经是随时全量保存）；确认 `/profile` 页面每字段 onChange 都触发 saveProfile（现在的 `useEffect(() => saveProfile(profile), [profile])` 已经满足"随填随存"）。
- Profile 页 Done 按钮**去掉 `disabled={!complete}`**，改成任何时候都可以点，文案统一为"完成"；退出即保存已有内容。

### 2. `src/components/hello-composer.tsx` — 内嵌 name 补齐

- 组件顶部加一个只在 `!hasName(loadProfile())` 时显示的一行 input：
  - Label: `t("hello.name_inline_label")` → "你会以什么名字出现"
  - Input：受控 state，`onChange` 立即 `saveProfile({ ...loadProfile(), name })`
  - 未填名字时，Send 按钮的 `disabled` 追加 `!name.trim()`
  - 已填过名字时这一行完全不渲染
- Send 逻辑不变。

### 3. `src/components/canvas/intro-canvas.tsx` — 门槛降级 + 引入抽屉

- 删掉现有 `Dialog` gate、`gateOpen` state、`navigate({ to: "/profile" })` 分支、`sessionStorage.setItem("kindred:profile:return", ...)`。
- `requestSayHello()` 直接 `setComposing(true)`——不再检查任何 profile 字段（name 会由 HelloComposer 内嵌兜住）。
- 在 `conn?.status === "waiting"` 分支（已发出 hello 等待中）下方增加一条 `<ProfileNudgeInline />`：
  - 仅当 `!isProfileComplete(loadProfile())` 显示
  - 文案："在等 ta 的时候，让 ta 看到更多的你 · 2 分钟"
  - 点击 → `setSheetOpen(true)`
- 页面挂 `<ProfileSheet open={sheetOpen} onOpenChange={setSheetOpen} />`。

### 4. `src/components/profile-sheet.tsx` — 新建

- `Sheet` (side="right", `w-full sm:max-w-xl`, 内部滚动)。
- 复用同一份表单 UI（把 `src/routes/profile.tsx` 的 `<main>` 内容抽成独立组件 `<ProfileForm />` 让抽屉与独立页共享）。
- Header：进度徽章 + X 关闭。
- 底部"完成"按钮总是可点，点击关抽屉；不校验"完整"。
- 关闭时组件卸载即可，不需要回调（数据已随填随存）。

### 5. `src/routes/profile.tsx` — 独立页简化

- 抽出 `<ProfileForm />` 与抽屉共用。
- 顶部 header 保留（Kindred logo → "/"，进度徽章 + LangSwitcher）。
- Done 按钮去掉 `disabled`，点击 `navigate({ to: "/" })`。
- **删除 `kindred:profile:return` sessionStorage 回跳逻辑**——不再需要。

### 6. `src/components/home.tsx` — nudge 改为原地打开抽屉

- nudge 里的 "去完善" 由 `<Link to="/profile">` 改为 `<button onClick={() => setSheetOpen(true)}>`。
- 页面挂 `<ProfileSheet open={sheetOpen} onOpenChange={(o) => { setSheetOpen(o); if (!o) { const p = loadProfile(); setProfileReady(isProfileComplete(p)); setProgress(profileProgress(p)); } }} />`。
- 保留 header 那个 "Profile" 链接跳 `/profile` 独立页（给想深链或想全屏编辑的人）。

### 7. `src/components/canvas/meet-canvas.tsx` — 一致化

- 若里面有"发起下一步（约见、发消息等）"按钮，同样直接放行，只用 HelloComposer 或对应 composer 里内嵌 name 兜底。
- 若没有触达动作则不改。

### 8. 文案 `src/locales/{en,zh-CN}/common.json`

- 新增 `hello.name_inline_label`, `hello.name_inline_placeholder`
- 新增 `hello.nudge_while_waiting`（"在等 ta 的时候，让 ta 看到更多的你 · 2 分钟"）
- 现有 `hello.gate.*` 保留但不再使用（不删，避免破坏；下轮清理）
- `profile.done` 语义从"完成（灰态直到全填）"改为"完成"，可无条件点击；`profile.incomplete_note` 改为鼓励式："已填的都保留了，任何时候可以回来补。"

## 不动

- 两个 Agent 的对话逻辑、seed、connections、understanding
- IntroCanvas 的候选人卡、moments 展示、one-work 展示、`YourHelloRecap`
- Profile 字段结构（`Profile` type、`MOMENT_PROMPTS`、`OneWork`）
- i18n 现有 key 结构（只新增，不重命名）
- 路由 `/profile` 继续存在

## 用户完整体验

1. 新用户进 App → 首页可直接打字、可选 Matchmaker/SideBySide chip → 进入 Agent。
2. Matchmaker 对话，出候选人卡。首页与 Agent 顶部有一条不打扰的 nudge（"让 Matchmaker 更懂你 · 0/3"），点击原地打开 Profile 抽屉，可写可不写，关闭即保存。
3. 用户想 Say hello → 按钮**直接可点**。
4. HelloComposer 打开：如果还没填过名字，顶部多出一行"你会以什么名字出现" input；填完（约 5 秒）→ Send 亮起。
5. Hello 发出，进入 waiting 状态。waiting 卡下方一条邀请："在等 ta 的时候，让 ta 看到更多的你 · 2 分钟"，点击滑出 Profile 抽屉；关闭即保存已填内容。
6. 用户任何时候访问 `/profile` 或点首页 header 的 Profile → 独立页，同一份表单，同样随填随存，Done 无条件可点。

## 验收

1. 全新用户完成一次 Say hello 用时 ≤ 30 秒（只填名字 + 写一句 reply）。
2. Profile 抽屉 / 独立页在任意字段填一半退出，重进能看到已填内容。
3. Say hello 按钮永不因 Profile 不全而灰掉。
4. waiting 状态下能看到 Profile 补全邀请；点击原地打开抽屉，不跳路由；关闭抽屉后 waiting 状态、消息、候选人卡完好。
5. 首页 nudge 点击在首页原地开抽屉；关闭后进度数字更新。
6. `/profile` 独立页依然可用；Done 无条件可点，返回首页。
7. 首页 header 的 Connections / Profile 链接不产生 hydration mismatch（已在上轮修复，回归确认）。

## 技术备注

- `Sheet` 用现有 `src/components/ui/sheet.tsx`，无新依赖。
- `ProfileForm` 完全从 localStorage 读写，抽屉与独立页对同一 key 操作，天然一致。
- 每个字段 onChange → setState → useEffect saveProfile 已实现"随填随存"，无需额外 debounce。
