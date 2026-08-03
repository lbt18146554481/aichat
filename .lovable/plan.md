## 决策结论

**不建议拆成独立工程**。维持当前单仓库，但把 iOS 原生资产严格隔离到 `native/` 目录；未来 Android 同样放到 `native/android`。

理由：
- 你的 App 本质是「前端产物 + 原生壳」。业务逻辑、UI、状态全在 Web 端；iOS 端只负责 WebView、状态栏、启动屏、返回手势、外链浏览器。独立工程会造成两个仓库反复同步，收益很小。
- Capacitor 官方支持 `ios.path` / `android.path` 指向子目录，已核实。因此 `native/ios` 可以完整独立出来，同时保留单仓库的便利。
- 你未来自己上传 App Store 时，既可以同仓库打包，也可以把 `native/` 目录整体复制走作为独立 Xcode 工程上传（`native/ios` 只依赖 `native/www` 静态产物，不依赖 Vite/Node）。两条路径都支持。
- 移动端网页继续作为独立形态运行，完全不受影响；未来 Android 也是同一套 Web 代码 + 同一个 `native/` 目录结构。

## 目录结构

```text
capacitor.config.ts      根目录唯一原生相关文件（Capacitor 硬约束）：
                         webDir: 'native/www'
                         ios:     { path: 'native/ios' }
                         android: { path: 'native/android' }   // 后续用

native/
  ios/                   Xcode 工程（cap add ios 生成）
  android/               后续 Android，与 ios 平级
  www/                   iOS 内嵌用静态产物（gitignore）
  scripts/build-web.mjs  产物构建 + 拷贝到 native/www
  docs/ios-build.md      本地签名 / Archive / 上架 / 独立拆出指南
  README.md              原生侧维护说明

src/lib/platform/        Web 侧唯一的平台适配层
  index.ts               对外出口：isNative / platform / 能力 API；纯 TS，SSR 安全
  bridge.ts              唯一允许 await import('@capacitor/*') 的文件
  web.ts                 Web 实现（新窗口开链接、状态栏空操作）
src/hooks/use-native-back.ts   原生返回手势 → 路由返回（Web 空操作）
```

`src/` 里只新增 4 个薄文件，且全是平台无关的接口层；所有原生资产、工程、脚本、文档都在 `native/` 内，不与 Web 代码混放。

## 为什么不把 `src/lib/platform/` 也塞进 native/

它是 Web 代码调用的入口，必须参与 Vite 构建与 `@/` 别名解析。放进 `native/` 会让 Web 反向依赖原生目录，反而更乱。做法是：它不含任何 iOS 细节，只声明能力接口；真正的插件调用集中在 `bridge.ts` 一个文件里。

## 你自己打包上传 App Store：支持，两种工作方式

1. **同仓库**（推荐）：`npm run native:build && npx cap sync ios && npx cap open ios`，在 Xcode 签名、Archive、上传。证书与 App Store Connect 全程由你掌控，我不接触任何密钥。
2. **完全拆出独立仓库**：`native/` 整个目录复制走即可编译上传（`native/ios` 只依赖 `native/www` 静态产物，不依赖 Node / Vite）。代价是每次前端更新需手动同步一次 `native/www`。

`docs` 会把两条路径都写清楚，含后续 Android 接入方式。

## 硬规则（写入项目 memory，防止后续迭代破坏）

1. 业务组件只允许 `import { platform } from "@/lib/platform"`，永不直接 import `@capacitor/*`。
2. `bridge.ts` 内只用**动态 import**，且在 `isNativePlatform()` 为真之后加载 —— 否则 SSR / 预渲染会崩。
3. 平台差异写成能力接口 + 实现替换（`openExternal` / `setStatusBar` / `hideSplash`），不在组件里散写 `if (ios)`。
4. `native/**` 不进 Vite 构建、不进 lint、不进 tsconfig include（原生工程有自己的构建体系）。

## 对 Web 端 / 移动网页 / Android 的影响

- **移动端网页**：仍是主形态，不分叉，同一套响应式组件，体验零变化。
- **Web 构建链路**：`dev` / `build` / `test` 全不改动，只新增 `native:build` / `ios:sync` / `ios:open` 脚本。
- **Android**：差异全在 `platform` 层，未来 `npx cap add android`（输出到 `native/android`）+ 图标即可，业务代码零改动。
- **测试**：现有单元 / e2e 继续跑 Web 路径；`platform` 层可注入 mock。

| 改动 | 影响 Web | 约束 |
| --- | --- | --- |
| 安装 `@capacitor/*` | 否 | 不被 Web 渲染路径静态引用 |
| 根 `capacitor.config.ts` | 否 | Vite 不读取 |
| `native/**` | 否 | 不参与现有构建 |
| `src/lib/platform/*` | 有风险，已约束 | 仅 `bridge.ts` 动态 import |
| 状态栏 / 启动屏 / 返回手势 | 否 | 全在原生分支 |
| 外部链接 | 否 | 原生用 Browser 插件，Web 保持 `<a target="_blank">` |

## 实施步骤

1. 安装 `@capacitor/core`、`cli`、`ios` + `status-bar`、`splash-screen`、`app`、`browser`；写根 `capacitor.config.ts`（`appId: app.lovable.maitri`、`appName: Maitri`、`webDir: native/www`、`ios.path: native/ios`、`contentInset: always`、品牌背景色）。
2. `native/scripts/build-web.mjs`：以 SPA / 预渲染模式产出静态资源并拷贝到 `native/www`；验证断网下首页 → 匹配 → 详情可走通。
3. 建 `src/lib/platform/` 适配层与 `use-native-back.ts`，替换外部链接与启动屏调用点。
4. 生成 1024×1024 App 图标与启动屏底图（品牌蓝 `#2F6FEB` + 深底极简 Maitri 标识）；`npx cap add ios`（落到 `native/ios`）；配 `Info.plist`（状态栏、`NSPhotoLibraryUsageDescription` 供头像上传）。
5. 复核 WebView 下 `visualViewport` 键盘行为，必要时用 Capacitor Keyboard 插件兜底。
6. 写 `native/docs/ios-build.md`：同仓库打包 / 完全拆出两条路径、签名、Archive、App Store Connect、TestFlight、常见拒审点。
7. 写入项目 memory：本地内嵌模式、`native/` 目录约定、Capacitor 仅动态导入、平台差异只走 `platform` 层。
8. 验证：跑单元测试与关键 e2e；移动端网页回归确认无差异；给出 iOS 真机验收清单（离线启动、启动屏、安全区、键盘、返回手势、头像上传、登录跳转）。

## 上架诚实提示

- Lovable 云端**不能编译 iOS**：签名、Archive、上传必须在你本地 Mac + Xcode 完成。
- 首次提交需准备：App 名称、隐私政策链接（有账号体系，Apple 必查）、App Privacy 数据声明、截图、审核用测试账号 **+ 一个可用邀请码**（你的注册需邀请码，不给测试码几乎必被拒）。
- 提供第三方登录就必须提供 Apple 登录 —— 现状已满足。
- OAuth 在原生需走系统浏览器 + 自定义 URL Scheme 回跳；本版先搭 URL Scheme 与回调路由骨架，各 provider 原生配置待你有开发者账号后联调。

## 本次不做

- 不做推送、内购、原生相机、Live Update。
- 不生成 Android 工程（结构已留位）。
