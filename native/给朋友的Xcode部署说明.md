# Compamore iOS — 给朋友的 Xcode 部署说明（小白版）

把本 zip **解压到任意文件夹**。你需要：Mac、Xcode、你的 **Apple 个人开发者账号**（年费 $99）。

本 App 采用 **Route A**：打开后加载线上网站 **https://compamore.com**（需联网）。网站更新后用户再开 App 就是新内容，一般不必为改文案重新上架。

---

## 一、你需要准备什么

1. Mac + 最新 **Xcode**
2. Xcode 已登录你的 Apple ID，且已加入 **Apple Developer Program**
3. 本压缩包解压后的文件夹
4. **第一次打开工程需要联网**（Xcode 会从 GitHub 拉 Capacitor 核心包）

---

## 二、Bundle ID（用你自己的，不必和示例一致）

工程里预填的示例是 `app.lovable.compamore`，**你可以改成你已在苹果后台注册的 Bundle ID**。

### 2.1 在 Apple Developer 创建（若还没有）

[Identifiers](https://developer.apple.com/account/resources/identifiers/list) → **+** → App IDs → App  
填你决定的 Bundle ID（例如 `com.你的名字.compamore`），保存。

### 2.2 在 App Store Connect 新建 App

用**同一个** Bundle ID 创建 App。

### 2.3 在 Xcode 改成你的 Bundle ID

1. 打开 `Compamore-iOS/App/App.xcodeproj`
2. 左侧点蓝色 **App** → 中间 target **App**
3. **Signing & Capabilities**：
   - 勾选 **Automatically manage signing**
   - **Team** 选你的团队
   - **Bundle Identifier** 改成你在苹果后台登记的那一个（覆盖示例即可）

URL Scheme 示例是 `compamore://`（在 `Info.plist`）。一般网页登录不依赖它；若你要改，可与产品名一致，但**不是**必须和 Bundle ID 相同。

---

## 三、打开工程（已修复 CapApp-SPM）

双击：

```
Compamore-iOS/App/App.xcodeproj
```

本包已把 Capacitor 插件打进 `App/capacitor-spm-deps/`，**不再依赖原仓库的 node_modules**。  
若仍提示 `Missing package product 'CapApp-SPM'`：

1. 确认已联网  
2. 菜单 **File → Packages → Reset Package Caches**  
3. 再 **File → Packages → Resolve Package Versions**  
4. 关闭 Xcode 重新打开  
5. 仍不行：确认解压路径里没有缺文件夹，且 `App/CapApp-SPM` 与 `App/capacitor-spm-deps` 都在

朋友**不需要**安装 Node / CocoaPods。

---

## 四、真机跑一下（建议）

1. 顶部选你的 iPhone 或模拟器  
2. ▶ Run  
3. 应出现启动图，再加载 compamore.com  
4. 白屏：先用 Safari 打开 https://compamore.com 测网络

---

## 五、Archive 上传 TestFlight / App Store

1. 顶部选 **Any iOS Device (arm64)**（不要选模拟器）  
2. **Product → Archive**  
3. Organizer → **Distribute App** → App Store Connect → Upload  
4. 到 App Store Connect → TestFlight 等待处理

若提示 build number 重复：把工程里 `CURRENT_PROJECT_VERSION` 加大 1 再 Archive。

---

## 六、审核材料提示

| 项 | 说明 |
| --- | --- |
| 隐私政策 URL | 如 `https://compamore.com/privacy` |
| 演示账号 / 邀请码 | 若注册要邀请码，写在审核备注 |
| 截图 | 按商店要求尺寸准备 |

---

## 七、对照表

| 项 | 说明 |
| --- | --- |
| 显示名 | Compamore |
| Bundle ID | **用你在苹果后台的**（示例 `app.lovable.compamore` 可改） |
| 加载网址 | `https://compamore.com`（在 `App/App/capacitor.config.json` → `server.url`） |
| 工程 | `Compamore-iOS/App/App.xcodeproj` |

---

## 八、常见问题

**Q：Missing package product 'CapApp-SPM'**  
A：用本说明配套的新 zip（含 `capacitor-spm-deps`）。旧包缺依赖会必现此错。然后 Reset / Resolve Packages，并保持联网。

**Q：Signing 红字**  
A：Team 是否选对；Bundle ID 是否已在 Developer 创建且属于该 Team。

**Q：Archive 灰色**  
A：设备必须选 Any iOS Device (arm64)。

**Q：打开不是 Compamore 网站**  
A：检查 `App/App/capacitor.config.json` 的 `server.url` 是否为 `https://compamore.com`。

有问题把 Xcode 红色报错全文截图发回即可。
