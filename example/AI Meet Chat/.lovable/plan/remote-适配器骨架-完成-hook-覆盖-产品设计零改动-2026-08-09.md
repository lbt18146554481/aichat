# remote 适配器骨架 + 完成 hook 覆盖（产品设计零改动）

## 真实现状（已完成分析）

- `src/data/ports` 已定义 8 个仓储接口，共 **47 个异步方法**。
- `src/data/adapters/local` 已实现本地委托，行为与重构前一致。
- 当前数据层迁移**只完成了一半**：仍有 **15 个组件/路由文件**直接 import `@/lib/*` 的本地存储模块，其中 `intents`、`blocklist`、`invites` 三个域甚至连 hook 都还没有。

如果你现在直接写真实 API，成本是：

| 方案 | 需改动文件 | 调用点 | 问题 |
|---|---|---|---|
| 不按数据层，直接在组件里写 fetch/axios | 15+ 个文件 | 40-60 处 | 鉴权、缓存、loading/error 散落 |
| 按当前数据层，但只补 remote 骨架 | 1 个文件 | 0 处 UI 改动 | 骨架能编译，但仍有 15 个文件绕过 hooks，接后端时这些文件会坏 |
| 按当前数据层，先补完 hooks 再写 remote | 1 个文件 + 3 个 hook + 15 个文件迁移 | 20-30 处 | 接后端时真正只改 1 个文件 |

## 核心判断：只做骨架有没有必要？

**单独做骨架价值有限。** 它会新增一个 `src/data/adapters/remote/index.ts` 让类型编译通过，但 47 个方法都只是抛出 "not implemented"。如果 15 个文件继续直连 localStorage，接后端时照样要逐一改这些文件。

**但骨架 + 完成 hooks 覆盖很有必要。** 这相当于把接后端这件事变成「一文件工程」：
1. 先把所有组件都改成从 `@/data/hooks` 取数据；
2. 新增 `src/data/adapters/remote/index.ts` 实现同样的 `Repos` 接口；
3. 改 `src/data/index.ts` 一行开关，即可切到真实 API。

## 本次交付内容

### 1. 补全缺失的 hooks

新增：
- `src/data/hooks/use-intents.ts`：`useMyIntents`、`usePublishIntent`、`useUpdateIntent`、`useRevokeIntent`、`useIntentPool`。
- `src/data/hooks/use-blocklist.ts`：`useBlocklist`、`useBlocklistActions`。
- `src/data/hooks/use-invites.ts`：`useValidateInvite`、`useMyInvites`、`useRemainingInvites`、`useGenerateInvite`。

每个 hook 都基于 TanStack Query 或本地 subscribe，保持与现有 hooks 风格一致。

### 2. 迁移 15 个仍直连 localStorage 的文件到 hooks

主要文件：
- `routes/auth.tsx` → `useAuth`（登录/邀请码）
- `routes/me.tsx` → `useSession`、`useMyInvites` 等
- `routes/profile.tsx` → `useProfile`、`useSaveProfile`
- `routes/side-by-side.tsx` → `useMyIntents`、`useIntentPool`、`useSavedWishes`
- `routes/connections.tsx` → `useConnections`、`useConnectionActions`
- `components/profile-form.tsx` → `useProfile`、`useSaveProfile`
- `components/account-menu.tsx` → `useSession`、`useAuth`、`useMyInvites`
- `components/canvas/meet-canvas.tsx` → `useProfile`、`useMyIntents`、`useSavedActions`
- `components/canvas/intro-canvas.tsx` → `useSavedActions`、`useConnections`、人物相关
- `components/canvas/connection-thread.tsx` → `useConnectionActions`
- `components/home.tsx` → `useAuth`、`useSessions` 等
- `components/mobile/tab-bar.tsx` → `useAuth`、`useUnseen`（已有）
- `components/session-list.tsx` → `useSessions`（已部分接入，只处理剩余类型）
- `components/saved-trigger.tsx` → `useSavedWishes`、`useSavedPeople`（已部分接入，只处理剩余）
- `components/workspace-header.tsx` → 只 import 类型，可改为 port 类型

迁移原则：只改 import 和调用方式，不改 JSX、文案、样式、交互路径。

### 3. 创建 remote 骨架

- `src/data/adapters/remote/index.ts`：导出 `remoteRepos: Repos`，实现 47 个方法，每个方法体统一调用 `notImplemented(name)` 抛出清晰错误，并附注释说明未来真实 API 语义。
- `src/data/index.ts`：增加 `VITE_DATA_SOURCE` 环境变量开关（默认 `local`），可选装配 `remoteRepos`。
- `src/data/adapters/remote/README.md`：填写实现真实 API 的步骤清单。

### 4. 契约测试

新增 `tests/unit/data-ports-contract.test.ts`：
- 断言 `localRepos` 与 `remoteRepos` 拥有同一组方法名与 Promise 返回；
- 断言每个 hook 都能正常工作（mock 或基于 local）。

## 好处 / 坏处

### 好处
- 接后端时只改 1 个文件：`src/data/adapters/remote/index.ts`。
- 页面、组件、样式、文案、交互路径完全不动，Lovable 仍可安全迭代 UI。
- 新增 hook 会顺带清理历史技术债，让数据流更统一。
- 契约测试确保未来两套适配器不会签名跑偏。

### 坏处 / 代价
- 本次工作量大：不只是新增一个 remote 文件，还要补 3 个 hook 并迁移 15 个文件。
- 没有新增用户可见功能，纯结构投入。
- 如果真实后端接口字段与当前本地模型差异大，remote 适配器内部签名仍需调整（但改动仍局限在 `src/data/`）。
- 多一层间接：读代码要从 hook → port → adapter 跳两次。

## 边界（本次不做）

- 不启用 Lovable Cloud、不建表、不写迁移、不写真实 API 请求。
- 不改任何页面设计、视觉、文案、路由、交互流程。
- 不动 `native/`、CI、版本脚本。

## 验证

- `lint` 0 error。
- 现有 30 项单测 + 新增契约测试全绿。
- `build:dev` 成功。
- `verify:native` 通过，原生隔离契约不受影响。
- 预览页面行为与当前逐帧一致。

## 总结

**直接实现 remote 骨架但不补齐 hooks，没有必要**，因为当前仍有 15 个文件直接绑定 localStorage，骨架解决不了真正问题。

**但骨架 + 完成 hooks 覆盖非常有必要**，它把「从本地存储切到真实 API」的改动面从 15 个文件、40-60 个调用点收敛到 1 个 adapter 文件 + 1 行开关。如果打算未来接入自研后端，这是成本最低的过渡方案。
