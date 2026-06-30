## 我先独立想清楚

你这条反馈里其实有三个独立判断，我分开回应：

**1. "见面"不该由系统安排。**
我同意，并且我之前错了。Hinge / Coffee Meets Bagel 的产品复盘里有一个反复出现的结论：**平台越深地介入"线下见面的细节"，用户越觉得被监控、越不来用第二次**。见面的时间、地点、是否要见，是两个成年人之间的私事——平台的职责到"让两个人可以自由地对话"为止。我上一稿把 Agent 推到"提议周六 10:30 见"那一步，是越界。砍掉。

**2. "刻意做慢"不该是产品规则。**
我之前为了对抗 Tinder 化加了"一周一题"的强制节奏。这是把设计师的价值观强加给用户。真正有效的反 Tinder 设计不是"逼用户慢"，而是**"减少无意义的选项数量"**（Hinge 的 "Designed to be deleted"、Barry Schwartz《选择的悖论》、以及 Aziz Ansari《Modern Romance》里反复提到的"过载导致瘫痪"）。节奏交还给用户。

**3. 产品要更简洁。**
现在 Matchmaker 已经有：clarifying / introducing / 多种 intent / usedAngles / passedIds / shownIds / reflections / 角度切换……功能没问题，但**闭环只差一步：让两个人能直接对话**。再加"五阶段渐进 + 每周问题 + 解锁机制"会让产品胀一倍，违背简洁。

---

## 设计依据（不是我个人偏好）

- **Hinge 产品数据**：配对后 48 小时内开始对话的关系，转线下成功率是 7 天后才开始对话的 3× 以上 → 不该再加人为延迟。
- **OkCupid 创始人 Christian Rudder《Dataclysm》**：用户在见面前交换的消息数与最终关系满意度**没有显著正相关**，过多文字反而制造期望落差 → Agent 不该自己拉长文字阶段。
- **Sherry Turkle《Reclaiming Conversation》**：异步文字让人误以为了解对方，真正的了解发生在同步互动里 → 一旦双方都愿意，就让他们自由对话，不要中间加层。
- **Nir Eyal《Indistractable》**：好产品给用户"控制感"，坏产品替用户做时间决策 → 不强加每周节奏。
- **Steve Krug《Don't Make Me Think》**：每多一个状态都是认知成本 → 五阶段砍到两阶段。

---

## 新方案：Introduce Someone 的最小闭环

**只有两个状态**：

```text
introduced  →  (双方都 say hello)  →  connected
```

**1. introduced**（用户看到引荐画像后的默认状态）
- 主操作：**Say hello**（一键，不写字）
- 次操作：**Pass**
- 隐私：对方不知道你看过 TA。

**2. waiting**（你点了 say hello，对方还没点）
- 卡片显示"已替你打过招呼，等 TA 回应"
- 同一个人不能重复 say hello
- 没有"已读 / 在线"指示

**3. connected**（双方都点了 say hello）
- 解锁：完整姓名、完整头像、一个**直接的文字对话窗口**
- 不再有问题、阶段、解锁条件、进度条
- 之后的一切——继续聊、视频、见面、停下——**都由两个人自己决定**，产品不介入、不提议、不安排

**没有的东西**（明确不做）：
- ❌ 每周问题 / 强制节奏
- ❌ 阶段 0/3 解锁进度
- ❌ Agent 提议见面时间地点
- ❌ 见面安全提示卡（这是用户自己的判断）
- ❌ 模糊头像 / 首字名等"渐进式揭示"——要么不连，要么连上就互相看得到，介于两者之间反而尴尬
- ❌ "stop / 婉拒"的中介话术——connected 之后任一方关闭对话即可，不需要 Agent 替谁说话

**保留的隐私底线**（这是真正必要的，不是噱头）：
- 在 introduced 阶段，对方完全不知道你看过 TA；只有你主动 say hello 后，对方那侧的 IntroCanvas 才会出现你的卡片和"TA 想认识你"的标记。
- 这是**双向 opt-in** 的本质——两个人都明确表达"愿意认识"才连上，被拒绝的一方永远不知道自己被看过。这一点 Hinge 的 "We Met" 流程、CMB 的 "Like" 机制都验证过有效，且不需要任何额外 UI。

---

## 改动清单（相对当前代码）

**新建**
- `src/lib/connections.ts` —— 极简状态机：`introduced | waiting | connected`，本地持久化；模拟对方在 say hello 后随机 5–15 秒回应（65% 接受，35% 永不回应——不显示"被拒"，自然冷却）。
- `src/components/canvas/connection-thread.tsx` —— connected 之后的直接对话窗口（普通输入框 + 消息流，本地存储，无 Agent 介入）。
- `src/routes/connections.tsx` —— Connections 列表页：左侧分组（Waiting / Connected），右侧选中后是 connection-thread 或等待状态。

**修改**
- `src/components/canvas/intro-canvas.tsx` —— 底部操作区根据 connection 状态切换：introduced → [Say hello] [Pass]；waiting → 灰态"已打招呼，等 TA 回应"；connected → [Open conversation]。保留现有的"换个角度 / 换个人"。
- `src/routes/matchmaker.tsx` —— 接 connections API；Pass 时把人加入 passedIds 并自动 introduce 下一个。
- `src/components/home.tsx` + `src/components/workspace-header.tsx` —— 顶部加 Connections 入口，有未读消息或新 connected 时显示小红点（**只在新事件发生时显示，不是常驻徽章**）。
- `src/locales/{en,zh-CN}/common.json` —— 新增 `connection.*` 文案；删除上一稿涉及"meeting / propose / weekly"的所有 key。

**不动**
- Matchmaker 的 clarifying / scoring / reflections / angle 逻辑——这些是已经成立的部分。
- Side by Side（独立 Agent，原本就以"一起做某件事"为产物，自然包含见面，不冲突——但同样不再由系统调度时间地点，只提议"一起做什么"，把时间地点的细节交给双方在 connection-thread 里自己定）。
- 任何外部依赖。

---

## 闭环对照

| | 之前 | 这一版 |
|---|---|---|
| 状态数 | 5（introduced → hello → weekly × N → open → meet） | 2（introduced → connected） |
| 系统强加的节奏 | 每周一题 | 无 |
| 系统是否安排见面 | 是 | 否 |
| 用户的主操作 | 答题 / 等待解锁 | Say hello → 直接聊 |
| Agent 在 connected 之后的角色 | 仍在中介 | 完全退出 |

## 验收

1. 点 Say hello → 卡片立即变 waiting；5–15 秒后或刷新页面，可能变 connected 或保持 waiting。
2. connected 后，IntroCanvas 出现 Open conversation 按钮；点进去是普通对话窗口，可以自由发消息、对方有本地模拟回复。
3. 整个流程里**找不到任何**"建议时间 / 建议地点 / 本周问题 / 阶段进度"的 UI 元素。
4. Pass 一个人后，对方不会知道；自己再也不会被引荐到这个人。
5. 首页和 Workspace 顶部的 Connections 入口在新 connected / 新消息出现时有红点，否则安静。

如果你认同这个收敛方向，我落地；如果你认为 connected 之后 Agent 还应该保留某种轻介入（例如"如果两周没说话，要不要 Agent 帮你重新打个招呼"），告诉我，我把它作为唯一可选的退出辅助加回来，但默认我不放任何这类机制。