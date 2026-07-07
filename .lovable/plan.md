
## 问题定义

用户在 Matchmaker 里描述择偶偏好 → 系统推人 → 用户对某个人发了 hello。**然后呢？** 当前是：卡片上只显示"已送达"，其他啥也没有。用户被"卡"在这张卡片上——想继续探索不知道怎么继续，想看进展要跳到 /connections，对方回没回也没提醒。

从用户视角，发完 hello 之后只该做三件事：

1. **继续看下一个人**（不必坐等）
2. **一眼知道之前发的有没有结果**（不用主动查）
3. **对方回了，能立刻回消息**（一个入口）

## 设计原则

- **发完 hello = 松一口气，不是盯着屏幕**。所以发完之后的主 CTA 必须是"看下一个"，不是"等她回"。
- **进展是被推送到你眼前的，不是你去查的**。connected 事件要在用户当前所在页面（Matchmaker）就能感知。
- **不制造焦虑数字**。徽标只用红点，不用未读数字堆砌。
- **sent 状态对用户可见但不打扰**。用户至少要能在 Connections 里看到"我发出去还没结果的那几个人"，否则它们像凭空消失。

## 用户流程（发 hello 之后）

```text
[Matchmaker 卡片：已发 hello，status=sent]
    ├─ 主 CTA →「看下一个人」（触发 actAnotherPerson）
    ├─ 次要 →「去 Connections」(带红点，如果有未读)
    └─ 底部小字：「她回你的时候我会提醒你」

  ↓ 后台 30-90s 决定

[分支 A: connected]
    - Header 右上角出现一个圆点通知（红点 + 头像）
    - 用户点通知 → 直接跳 /connections 打开该人
    - 若用户还在看该人的卡片：卡片自动切成「打开对话」按钮 + 加一句「她回你了」

[分支 B: faded]
    - 完全静默，无提醒
    - 用户如果主动回到该人卡片：显示温和 hint + 两个 CTA
        「看下一个」/「换个方式再说一次」（重新展开 composer）
```

## 具体改动

### 1. `src/components/canvas/intro-canvas.tsx` — 发完 hello 之后的卡片

`conn?.status === "sent"` 区块补齐 CTA：

```text
[已送达 chip]
[你引用了什么 + 你写了什么 — 已有的 YourHelloRecap]
─────
主按钮：「看下一个人」→ 调用 onAnotherPerson
次要链接：「去 Connections 看进展」→ Link to="/connections"
小字：「她回你的时候我会提醒你」
```

`conn?.status === "faded"` 区块补 CTA：

```text
[hint 文本 — 已有]
主按钮：「看下一个人」
次要链接：「再说一次」→ 清掉 conn，重新展开 composer
   （sayHello 已允许 faded 后重新发起，逻辑已 ready）
```

`conn?.status === "connected"` 区块补一个次要按钮「继续看下一个」。

### 2. `src/components/workspace-header.tsx` — 通知红点

Header 右上角挂一个 NotificationBell 类组件（复用现有 `hasUnseen()`）：

- 有未读 → 红点 + 一个圆形头像叠加（取最新 connected 或 incoming 的那个人）
- 点击 → 跳 `/connections`，自动打开那个人
- 每 3s 轮询一次 `list()`（连接状态变化不是热路径，够用）

这是整个"发完 hello 之后仍在 Matchmaker" 的关键闭环——之前用户根本不知道对方回了。

### 3. `src/routes/connections.tsx` — 加 sent section

Sidebar 顺序改成：

```text
新的问候（incoming）  ← 红点
在聊（connected）
等回音（sent）        ← 新增，灰色小字，无红点
─────
没有回音（faded，可折叠）
```

sent 段落让用户能一眼看到"我发出去在等的这几个人"——目前它们从视图里彻底消失了，只有回到 Matchmaker 该人卡片才看得到。

sent 行点击后：跳回 Matchmaker 该人卡片（因为 sent 状态没有 thread 可看，回到卡片是最自然的落点）。用 `sessionStorage` 传一个"要打开的 personId"，Matchmaker 页读一次就消费掉。

### 4. `src/lib/connections.ts` — 一个小新增

新增 `undoFadedFor(personId)`：清掉 faded 状态，让「再说一次」可以从零开始。

### 5. i18n（新增 key）

```text
intro.after_hello_hint     = "她回你的时候，我会在右上角提醒你"
intro.next_person_after    = "看下一个人"
intro.check_progress       = "去 Connections 看进展"
intro.hello_again          = "换个方式再说一次"
intro.while_you_chat       = "继续看下一个"
connection.section_sent    = "等回音"
notify.replied             = "{{name}} 回你了"
```

## 明确不做

- 不做未读数字，只红点
- 不做实时 WebSocket / 后台推送（原型阶段轮询足够）
- 不改 Matchmaker Agent 的对话逻辑
- 不改 sayHello / scheduleResolution 的决策规则
- 不做撤回 hello、不做编辑 hello

## 验收

1. 发完 hello，卡片上有一个明显的「看下一个人」大按钮，用户不会卡住。
2. 用户点「看下一个」→ Matchmaker 直接介绍下一个人，之前那个 sent 记录仍在。
3. 后台 connected 发生时，Header 右上角自动亮起红点+头像，无需刷新。
4. 点红点 → 跳 /connections 且直接打开该人的对话。
5. Connections 侧栏新出现「等回音」段，能看到所有 sent。点击后回到 Matchmaker 该人卡片。
6. Faded 之后，卡片上两个明确 CTA：看下一个 / 再说一次。「再说一次」能重新打开 composer 并成功发送。
