# Compamore 上架 App Store —— 新手操作指南

你好！按下面步骤做就行。不懂编程也没关系，主要是点按钮。

有问题把**截图**发给开发者。

---

## 开始前准备好这些

1. 一台 **Mac 电脑**
2. 已开通的 **苹果开发者账号**（一年约 99 美元那种）
3. 从 App Store 安装 **Xcode**（很大，要下很久，装好即可）
4. 安装 **Node.js**  
   打开：https://nodejs.org  
   下载左边 **LTS** 版本，一路「下一步」装完
5. 开发者给你的压缩包：`Compamore-iOS-AppStore-handoff.zip`

---

## 第 1 步：解压

1. 把 zip 放到桌面
2. 双击解压
3. 会得到一个文件夹，名字类似：`Compamore-iOS-AppStore-handoff`

---

## 第 2 步：用「终端」装东西（复制粘贴即可）

1. 打开 **终端**（按 `Command + 空格`，搜索「终端」或 Terminal）
2. 复制下面这一行，粘贴进终端，按回车  
   （如果文件夹不在桌面，把路径改成你的实际位置）

```bash
cd ~/Desktop/Compamore-iOS-AppStore-handoff
```

3. 再依次复制、粘贴、回车（每一行等它跑完再贴下一行）：

```bash
npm install
```

```bash
npm run ios:sync
```

```bash
npm run ios:open
```

最后一条会自动打开 **Xcode**。  
如果某一步变红报错，把终端内容截图发给开发者。

---

## 第 3 步：在苹果网站创建一个「App 身份证」（Bundle ID）

1. 用浏览器打开：https://developer.apple.com/account  
2. 登录你的开发者账号  
3. 找到 **Identifiers**（标识符）→ 点左上角 **+**  
4. 选 **App IDs** → **App** → Continue  
5. Description 随便写，例如：`Compamore`  
6. Bundle ID 选 **Explicit**  
7. 填写一串英文，例如：

```text
com.zhangsan.maitri
```

（把 `zhangsan` 换成你的拼音。不要中文、不要空格）

8. 一路 Continue / Register 保存

---

## 第 4 步：在 Xcode 里「签名」

1. 左边列表点最上面的蓝色图标 **App**
2. 中间上方点 **Signing & Capabilities**
3. 勾选 **Automatically manage signing**
4. **Team** 下拉，选你自己的名字 / 个人团队
5. **Bundle Identifier** 改成第 3 步你刚创建的那一串  
   例如：`com.zhangsan.maitri`

如果 Team 是空的：

- 菜单栏点 **Xcode → Settings → Accounts**
- 点左下角 **+**，登录你的 Apple ID
- 再回到 Signing 页面选 Team

---

## 第 5 步：先用手机试一下（建议做）

1. 用数据线把 iPhone 连上 Mac
2. 手机上点「信任」
3. Xcode 窗口顶部，设备列表里选你的 iPhone
4. 点左上角三角形 **▶ 运行**
5. 手机上应出现 App，能打开网页内容

能打开再继续下一步。  
打不开：截图发给开发者。

---

## 第 6 步：正式打包并上传

1. Xcode 顶部设备列表，改成：

```text
Any iOS Device (arm64)
```

（不要选模拟器 Simulator）

2. 菜单栏点：**Product → Archive**
3. 等它完成（可能要几分钟）
4. 弹出窗口后点：**Distribute App**
5. 选：**App Store Connect** → Next
6. 一路 Next，最后点 **Upload**
7. 等到提示上传成功

---

## 第 7 步：在 App Store Connect 填资料并提交审核

1. 打开：https://appstoreconnect.apple.com  
2. 点 **我的 App（My Apps）** → 左上角 **+** → **新建 App**
3. 选刚才那个 Bundle ID
4. 填写：
   - App 名字
   - 截图（让开发者发给你）
   - 简介等
5. 隐私政策网址填：

```text
https://pelegant.info/privacy
```

6. 审核备注里写：测试账号、密码、邀请码（向开发者要）
7. 可以先发 **TestFlight** 自己装一下试试
8. 没问题再点 **提交以供审核**

---

## 超简流程（记这个就够了）

```text
解压
→ 终端：npm install → npm run ios:sync → npm run ios:open
→ 苹果网站建 Bundle ID
→ Xcode 选 Team、填 Bundle ID
→ 真机试跑
→ Product → Archive → 上传
→ App Store Connect 填资料 → 提交审核
```

---

## 你不需要做的事

- 不需要会写代码
- 不需要 `.env`、不需要密钥文件
- 不需要管服务器  
  （App 打开后会自动访问线上网站 `https://pelegant.info`）

---

## 卡住了怎么办？

发给开发者这三样：

1. 做到第几步了  
2. 屏幕截图  
3. 终端或 Xcode 里的红色报错文字  

祝顺利！
