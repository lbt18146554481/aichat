# 引荐之后：如何让两个陌生人真正走到一起

## 回到问题本质

Agent 把对的人放到你面前，只是第一步。真正难的是**第一句话**——
- 陌生人发消息门槛太低 → 沦为骚扰（Tinder/Bumble 的失败）
- 门槛太高 → 没人敢迈出第一步
- 即时聊天 → 焦虑、已读未读、冷场

**核心洞察**：让"稀缺"和"中介"重新进入交友。Agent 不只是搜索器，更是**双方共同的中间人**——它了解你，也了解对方，可以替双方降低尴尬。

## 设计原则

1. **稀缺即珍重**：每天只能发出 1 封"信"（Letter），收到的人也只有 3 封同时在手
2. **异步而非即时**：信件而非聊天，给双方思考时间，去除已读焦虑
3. **Agent 做中介**：用户写信时，Agent 在旁提示"对方很在意独立性，别只夸外表"
4. **逐步解锁**：来回 3 封信之后，才解锁实时对话；之前一切都通过 Agent 转交

## 交互流程

```text
[Agent 引荐 Maya]
       │
       ▼
  「Send a letter」 ←─ 每日 1 次额度
       │
       ▼
  写信界面（左：编辑器；右：Agent 提示对方背景与建议）
       │
       ▼
  Agent 预览：「这封信里你提到了三次工作，
              Maya 说过想找个会聊生活的人，要不要改改？」
       │
       ▼
  Send → 对方收件箱（不显示在线/已读）
       │
       ▼
  对方回信 / 礼貌婉拒 / 沉默 72h 自动归档
       │
       ▼
  三轮往返后 → 解锁实时对话 + 见面建议
```

## 关键界面改动

### 1. 引荐页（Introduction Pane）右下角
- 把现在的 "Tell me more / Not for me" 重构为三个动作：
  - **Send a letter**（主操作，金色按钮，显示今日剩余额度）
  - Pass（友善划走，告诉 Agent 原因）
  - Save for later

### 2. 新增 Letter Composer（信件编辑器）
- 左半：编辑区，250 字软上限（够说清自己，不至于变成简历）
- 右半："Agent's notes on Maya"——三条要点：她最在意什么、她最近聊到什么、避免的话题
- 底部：Agent 实时点评（柔和提示，不强制）

### 3. 新增 Inbox（信箱）
- 左侧导航增加 Letters 入口
- 三栏：Sent / Received / Conversations（解锁实时聊天的人）
- 每封信旁边有 Agent 的一句话摘要："She wrote back warmly, mentioned hiking."

### 4. Agent 的新角色
- 在主对话里，Agent 会主动提：「Maya 回信了，要不要现在读？」
- 用户可以直接对 Agent 说："帮我礼貌地拒绝最新那封信"，Agent 起草、用户确认

## 配额与反骚扰

| 机制 | 数值 | 目的 |
|---|---|---|
| 每日发信额度 | 1 封 | 强迫认真挑人 |
| 同时持有未回信件 | 3 封 | 避免被淹没 |
| 自动归档 | 72h 无回应 | 去除已读焦虑 |
| 解锁实时聊天 | 3 轮往返 | 确认双方真的有意 |
| 拒绝 | 一键礼貌模板（Agent 代笔）| 保护双方体面 |

## 技术实现（纯前端 MVP）

- `src/lib/letters.ts`：Letter 数据模型（id, from, to, body, sentAt, status）+ localStorage 存储 + 每日额度逻辑
- `src/lib/mock-replies.ts`：候选人会在 30s–2min 内"自动回信"（模拟），让 demo 跑得起来
- `src/components/letter-composer.tsx`：双栏写信界面，含 Agent 提示
- `src/components/inbox-pane.tsx`：信箱视图，替换/扩展 Canvas 区
- `src/components/letter-thread.tsx`：单封信件往返视图
- `src/lib/agent.ts`：扩展状态机
  - 新动作：`actSendLetter`, `actOpenInbox`, `actDraftReply`
  - 新事件：Agent 主动播报"X replied to your letter"
- `src/components/introduction-pane.tsx`：把 CTA 改为 Send a letter / Pass / Save
- `src/locales/`：新增 letter / inbox / quota 相关中英文案

## 不做什么（明确取舍）

- 不做即时聊天（直到解锁前）——保留稀缺感
- 不显示在线状态、不显示已读——去除焦虑源
- 不做"喜欢/不喜欢"二元滑动——这是 Tinder 的核心错误
- 不做付费解锁额度——破坏稀缺逻辑

## 一句话总结

把"匹配-滑动-聊天"的快餐模式，换成"引荐-写信-见面"的慢节奏。Agent 不仅帮你找到对的人，还陪你迈出第一句话。
