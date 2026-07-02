# 回归简洁：Say hello → /profile 子页 → 返回后上下文完整保留

## 核心决策

1. 撤销上一版所有"内嵌 name 输入""waiting 抽屉""首页抽屉"的混乱设计，回到简单路径：Say hello → 若 profile 未达门槛 → 跳 `/profile` → 完成 → 返回原页面，看到和离开时一模一样的状态。
2. 之前唯一的问题是"返回后对话记录消失"——本次只专门修这一个问题。
3. 保留用户明确要求的两点：Profile 随填随存、Done 按钮无条件可点。这两点与子页面 gate 不冲突。

## 为什么之前会丢上下文

`/matchmaker`（及 `/side-by-side`）路由的 Agent 状态（消息流、当前候选人、composer 草稿）只存在组件内存里。跳去 `/profile` 再回来，组件重新挂载，状态清零，只剩 seed 的初始问候。修复：把运行时状态持久化到 sessionStorage，挂载时若有快照就恢复。

## 改动清单

### 1. 撤销上一版的混乱元素

**`src/components/canvas/intro-canvas.tsx`**
- 删除 `ProfileSheet` 引用、`sheetOpen`、`profileVersion`、waiting 状态下的补 profile nudge 按钮。
- Say hello 按钮 onClick 恢复为：
  ```
  const p = loadProfile();
  if (!hasName(p) || !isVitalsComplete(p)) {
    sessionStorage.setItem("kindred:profile:return", "/matchmaker");
    navigate({ to: "/profile" });
    return;
  }
  setComposing(true);
  ```
  门槛用 `hasName + isVitalsComplete`（名字 + 基础三段），比"只要名字"严谨，比"必须 3 条 moments"宽松。
- waiting 状态只保留原来的 `YourHelloRecap`。

**`src/components/hello-composer.tsx`**
- 删除内嵌 name input、`needName`、`updateName`。组件回到"选 moment + 写 reply"的纯净职责。
- Send 只 check `picked && reply.trim()`。

**`src/components/home.tsx`**
- Nudge 的"去完善"改回 `<Link to="/profile">`，删除 sheetOpen 相关 state 与 ProfileSheet 挂载。

**`src/components/profile-sheet.tsx`**
- 删除该文件（不再使用）。

**`src/components/canvas/meet-canvas.tsx`**
- 若上一版为它加了 sheetOpen，回退；原本没改则不动。

### 2. 保留 Profile 随填随存 + Done 无条件可点

**`src/routes/profile.tsx`**
- 继续用 `<ProfileForm />` 共享组件。
- Done 按钮不加 disabled，点击：
  ```
  const back = sessionStorage.getItem("kindred:profile:return");
  sessionStorage.removeItem("kindred:profile:return");
  navigate({ to: back || "/" });
  ```
- 页面顶部：当 `kindred:profile:return` 存在时显示一行小字"填完这些，再回去打招呼"。
- `ProfileForm` 内部 `useEffect(() => saveProfile(profile), [profile])` 已实现随填随存，不动。

**`src/lib/profile.ts`**
- 保留 `hasName`、`isVitalsComplete`、`isProfileComplete`、`profileProgress`。

### 3. 本次核心修复：Agent 运行时状态持久化

**`src/lib/agents/matchmaker.ts`**
- 新增 helper：
  ```
  const KEY = "kindred:matchmaker:state:v1";
  export function saveMatchmakerState(s) { sessionStorage.setItem(KEY, JSON.stringify(s)); }
  export function loadMatchmakerState() { const raw = sessionStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; }
  export function clearMatchmakerState() { sessionStorage.removeItem(KEY); }
  ```

**`src/routes/matchmaker.tsx`**
- 初始化：`useState(() => loadMatchmakerState() ?? initialMatchmakerState())`。
- 变更：`useEffect(() => saveMatchmakerState(state), [state])`。
- 效果：从 /profile 返回后消息流、当前候选人、understanding 完整还原。

**`src/lib/agents/side-by-side.ts` + `src/routes/side-by-side.tsx`**
- 同一模式，key 用 `kindred:sxs:state:v1`。

**IntroCanvas 内部 UI 草稿**（composer 是否打开、reply 草稿、picked 选中）
- sessionStorage key `kindred:intro:draft:<personId>`，字段 `{ composing, picked, reply }`。
- 挂载 useEffect 读回；state 变化写回；Hello 发送成功后清掉此 key。
- 效果：从 /profile 返回后 composer 依然打开、写到一半的 reply 还在。

### 4. 文案清理

**`src/locales/{en,zh-CN}/common.json`**
- 删除上一版遗留的 `hello.name_inline_label / name_inline_placeholder / name_inline_hint / nudge_while_waiting`。
- 保留/新增 `hello.gate.return_hint`（"填完这些，再回去打招呼"）供 /profile 顶部条使用。

## 用户完整体验

1. 未填 profile 的用户点 Say hello → 跳 `/profile`，顶部提示"填完再回去打招呼"，字段随填随存，Done 无条件可点。
2. 点 Done → 回 `/matchmaker`，消息、候选人卡、understanding、composer 打开状态、写到一半的 reply 全部保持原样。
3. 已填 vitals 的用户点 Say hello → 直接展开 composer，零跳转。
4. 首页 nudge / header Profile 链接：进 /profile 同一表单；Done 后回 `/`（未设 return key）。

## 验收

1. 未填 profile 用户点 Say hello → 跳 /profile。
2. 在 /profile 填完 Done → 回 /matchmaker，上一次对话消息 + 候选人卡 + composer 状态 + reply 草稿全部还在。
3. 已填 vitals 用户点 Say hello → 不跳转，直接 composer。
4. Profile 填一半刷新 → 已填内容还在。
5. Done 按钮无 disabled，任意时刻可点。
6. 首页 nudge / header 链接跳 /profile 正常；从这两处进入 Done 后回 /。
7. UI 上不再出现"内嵌 name""waiting 抽屉""首页抽屉"。

## 技术备注

- sessionStorage 用于 Agent 运行时状态（一次会话一次探索，关标签即清）；Profile 本身继续 localStorage。
- 持久化 key 统一 `kindred:*:v1`，便于 schema 变更时通过版本号失效。
- 无新依赖；删除 profile-sheet.tsx，新增两个 agent state helper 与一个 intro-draft helper。
