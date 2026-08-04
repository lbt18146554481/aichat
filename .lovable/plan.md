# 修复仓库原有 Lint 错误

当前 `bunx eslint .` 报出 **13 个 error + 10 个 warning**。经确认：这些都不是功能性缺陷，构建与测试都能通过；但它们会让「Lint 是否干净」这条信号失效，也会污染 CI 输出。建议全部修掉 error，warning 分类处理，且不改动任何目录结构、组件 API 或运行时行为。

## 需要修的 error（13 个）

1. **`src/components/profile-form.tsx:618`** — 文件里写了 `// eslint-disable-next-line @next/next/no-img-element`，但本项目不是 Next.js、没有该规则，于是 ESLint 反而报「规则不存在」。删掉这行无效注释即可（`<img>` 本身保留不动）。
2. **`src/components/saved-trigger.tsx:104 / 113`** 与 **`src/routes/side-by-side.tsx:333`** — 路由 `search` 参数使用了 `as any`。改为窄类型断言（按各路由已有的 search 形状），不改变跳转参数内容。
3. **`src/lib/agents/matchmaker.ts:195`、`src/lib/agents/side-by-side.ts:93`** — 正则字符类里多余的 `\[` 转义。去掉反斜杠，正则语义完全一致。
4. **`src/lib/intents.ts:296`** — `let next` 从未整体重新赋值（只改属性），改成 `const`。
5. **`src/lib/saved-intents.ts:32`、`src/lib/saved-people.ts:32`** — `catch {}` 空块。补一行「忽略写入失败」的注释或 `void 0`，保持「静默失败」的原有行为不变。
6. **`scripts/verify-native-isolation.mjs`（4 处）** — 纯 Prettier 排版，`bunx eslint --fix` 自动修复，逻辑不动。

## warning 的处理建议

- **`react-refresh/only-export-components`（8 个）**：其中 6 个来自 shadcn 生成的 `src/components/ui/*`（badge/button/form/navigation-menu/sidebar/toggle），是官方模板的固有写法，**不动**；`meet-canvas.tsx`、`saved-trigger.tsx` 两处也只影响开发时热更新粒度，拆文件会动结构，建议同样保留。
- **`react-hooks/exhaustive-deps`（`intro-canvas.tsx:139/145`）**：这两个 effect 是刻意「只在特定信号变化时跑一次」的恢复逻辑，补依赖会改变行为、有重复触发风险。建议加带说明的 `eslint-disable-next-line`，与仓库其他地方（如 `side-by-side.tsx`）的既有做法一致，从而让 lint 输出彻底干净。

## 结构影响确认

- 不新增/删除/移动任何文件，不改目录结构，不触碰 `native/`。
- 不修改任何组件 props、导出名或数据模型；改动均为注释、类型断言、正则转义、`let`→`const`、排版。
- 完成后运行 `bunx eslint .`（期望 0 error）、`bun run build`、`bun run test`、`bun run verify:native` 做回归验证。
