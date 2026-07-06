
# Say Hello 之后的产品设计

## 一、先把问题剥到最小

发送方 A 发了 hello 给 B。**只有两个分支**：

- **分支 1：B 想和 A 聊** → 目标是让两人尽快开始真正的对话
- **分支 2：B 不想和 A 聊** → 目标是让双方都体面地离开，谁都不难堪

其他一切（"等待中"、"已读"、"在线"、"48小时倒计时"）都是干扰项。任何时间感、进度条、催促信号都会把"先做朋友"的气质破坏掉。

**关键判断**：A 不应该看到"B 正在犹豫"或"B 拒绝了你"。A 只应该看到两种结果之一：**可以聊了** 或 **这次没有回音**。B 同理，B 不应该被逼着"接受/拒绝"，B 只有两个动作：**回一句** 或 **不回**。

## 二、两个分支的产品流程

### 分支 1：B 想聊

```
A 发 hello（引用 B 的 moment + 一句话）
        ↓
B 在"收到"里看到：A 的名片 + A 引用的那条 moment + A 的一句话
        ↓
B 在同一个界面回一句（可选：引用 A 的一条 moment）
        ↓
瞬间连上，双方都进入正常聊天线程
A 侧的这条 hello 从"已送出"直接变成"已连接"，无中间态
```

**A 看到的**：hello 发出后，卡片显示"已送达"。当 B 回了，卡片变成正常聊天入口，红点提示。**没有"等待中"这个显式状态给 A 看**——A 只知道"发出去了"和"聊上了"两件事。

**B 看到的**：Connections 页顶部出现"新的问候"一小段。点开就是一个卡片：A 的头像/名字/城市/职业 + A 引用的 B 的那条 moment（高亮） + A 写的一句话。下面直接就是回复框（复用 HelloComposer）。回完即连上。

### 分支 2：B 不想聊

B 的动作只有一个：**关掉那张卡片**（叫"稍后再说"或直接一个 × ）。不需要"拒绝"按钮，不需要理由。

- B 侧：卡片消失，归档到一个折叠的"以后再说"区（B 可随时反悔重新打开回复）
- A 侧：**hello 卡片安静地淡出**。没有"被拒绝"通知，没有红字。可能的表达是：卡片从主列表移到底部"没有回音"折叠区，灰色小字"这次没聊上"

**A 想再试同一个人**：60 天内在 Matchmaker/Side by Side 里遇到同一个 B 时，"say hello" 按钮显示为"上次没聊上，先看看别人"的柔和提示，但**不硬性禁用**——如果 A 有新东西想说，仍然可以再发一次。这保留了产品的温度，也不制造"黑名单"。

## 三、"等多久算没回音"的处理

产品里 A 永远不看到倒计时。内部逻辑：
- hello 发出后立刻进入"pending"（A 侧只显示"已送达"）
- 原型里 45–90 秒后本地决定 B 的选择（70% 想聊 / 30% 不想聊），真实版本里由 B 的操作决定
- 一旦决定：要么升级到"已连接"（分支 1），要么淡出到"没有回音"（分支 2）
- **不存在"waiting"这个用户可见的状态**——这是上一版设计的最大冗余

## 四、和上一版比，砍掉了什么

| 上一版有 | 这一版为什么砍 |
|---|---|
| `waiting` 显式状态 + 撤回按钮 | A 不需要盯着"她还没回"。撤回是伪需求，制造焦虑 |
| `quiet` 灰色卡 + 60 天硬冷却 | 太像"黑名单"。改为温和提示 + 折叠归档，不硬禁 |
| B 侧"稍后再说"和"忽略"两个动作 | 合并成一个 × |
| 4 个 sidebar 分区（收到/已连接/等待/静默） | 只要 2 个：**收到** + **在聊**；底部一个可折叠的**没有回音** |
| "24h/45-90s" 倒计时逻辑暴露给用户 | 完全内部化 |

## 五、要改的文件

### 1. `src/lib/connections.ts`
- 状态精简为 `"incoming" | "connected" | "faded"`
  - `incoming`：B 侧未回的收件
  - `connected`：双方接上，正常聊天
  - `faded`：B 关掉了卡片，A 侧折叠归档
- 新增 `respondToIncoming(personId, fromMe)` → 转为 `connected`，同时把 A 的原 hello 也升级
- 新增 `dismissIncoming(personId)` → 转为 `faded`
- 移除 `waiting` 相关代码、`withdraw`、`cooldown` 硬表
- 保留 `maybeSeedIncoming`：在用户填够 3 个 moments 后，本地随机种一两个 `incoming` 让 B 侧界面不是空的
- 原有的 `scheduleReply` 定时器改为决定"想聊 / 不想聊"两种结局

### 2. `src/routes/connections.tsx`
Sidebar 只有两段可见 + 一个折叠段：
```
收到（incoming，有红点）
在聊（connected）
─────
没有回音（faded，默认折叠，灰色小字）
```

### 3. `src/components/canvas/incoming-hello.tsx`（新建）
右侧画布，B 侧看 incoming 时的视图：
- 顶部：A 的名片（头像/名字/城市/职业，点名字可跳看 A 的完整 profile）
- 中部：A 引用的 B 的那条 moment（复用现有引用样式）+ A 的一句话
- 下部：`HelloComposer`（复用），B 可选引用 A 的一条 moment + 回一句
- 右上：一个小 `×`，hover 出 tooltip"稍后再说"

### 4. `src/components/canvas/connection-thread.tsx`
不变，`connected` 状态下的现有线程 UI 已经够用。

### 5. `src/components/canvas/intro-canvas.tsx`
"say hello" 按钮：如果对该 person 存在 `faded` 记录，按钮下方加一行小字 `t("hello.faded_hint")`（"上次没聊上，也许先看看别人"），按钮本身**不禁用**。

### 6. `src/components/home.tsx`
`hasUnseen` 判断加入 `incoming` 分支（现有已支持 unseen 逻辑，只需覆盖新状态）。

### 7. i18n（中英各一份新增 key）
```
connection.section_incoming = "收到"
connection.section_connected = "在聊"
connection.section_faded = "没有回音"
connection.faded_hint = "这次没聊上"
incoming.title = "{{name}} 想认识你"
incoming.dismiss = "稍后再说"
hello.faded_hint = "上次没聊上，也许先看看别人"
hello.delivered = "已送达"
```

## 六、明确不做

- 不做已读回执、在线状态、输入中提示
- 不做超时自动过期（faded 就是 faded，不会再变）
- 不做"拒绝理由"、"举报"、"屏蔽"
- 不做通知徽标数字，只保留红点
- 不改 Matchmaker/Side by Side 推荐逻辑
- 不改 Profile 结构

## 七、验收

1. A 发 hello → 主视图卡片显示"已送达"，无倒计时无进度条。
2. B 打开 Connections → 顶部"收到"区有卡片，点开是引用高亮 + 回复框。
3. B 回一句 → 双方立刻进入 `connected`，A 侧卡片红点提醒。
4. B 关掉卡片 → A 侧卡片安静落入"没有回音"折叠区，无通知。
5. A 再次在 Matchmaker 遇到 B → say hello 按钮下有柔和小字，仍可发送。
6. 全流程无"拒绝/等待中/超时"等词。
