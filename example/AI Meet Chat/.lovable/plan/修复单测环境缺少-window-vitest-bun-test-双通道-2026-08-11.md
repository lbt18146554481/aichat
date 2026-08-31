# 修复单测环境缺少 window（vitest + bun test 双通道）

## 现状核实（已运行验证）

- `bunx vitest run`：**4 个文件 / 30 项全部通过**（jsdom 环境由 `vitest.config.ts` 提供）。
- `bun test`：**5 通过 / 25 失败**，报错均为 `ReferenceError: window is not defined`（如 `tests/unit/saved-people.test.ts:15`）。

结论：报错只出现在 `bun test` 通道。Bun 内置测试器不读 `vitest.config.ts`，因此没有 jsdom，也没有 `window` / `localStorage`。

## 修复必要性

有必要，但属于**测试基建**范畴：
- 团队与 CI 里任何人执行 `bun test`（Bun 项目的默认习惯）都会看到 25 项红色失败，掩盖真实回归信号。
- 修复仅涉及测试环境注入，不触碰 `src/` 业务代码、产品设计或交互。

## 方案（零新增依赖）

1. 新增 `tests/setup/dom.ts`：当 `globalThis.window` 不存在时，注入一个最小 DOM 垫片——`window`（指向 globalThis）+ 内存版 `localStorage` / `sessionStorage`（实现 `getItem/setItem/removeItem/clear/key/length`）。若已存在（jsdom 下）则完全不做任何事。
2. `bunfig.toml` 增加：
   ```toml
   [test]
   preload = ["./tests/setup/dom.ts"]
   root = "tests/unit"
   ```
   使 `bun test` 加载垫片，且只扫描单测目录（避免误抓 `tests/e2e` 的 Python 同名文件之外的内容）。
3. `vitest.config.ts` 增加 `setupFiles: ["./tests/setup/dom.ts"]`，保持两个通道走同一份 setup（在 jsdom 下为 no-op），避免以后行为分叉。
4. `package.json` 增加 `"test:bun": "bun test"`，`test` 脚本保持 `vitest run` 不变。

## 验证

- `bunx vitest run` → 仍 30/30 通过。
- `bun test` → 30/30 通过。
- `bunx tsgo`（类型）与 `eslint .` 保持 0 error。
- 不修改任何 `src/` 文件，产品设计与交互零变动。
