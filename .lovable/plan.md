
# Kindred v16 — 三个 Agent 对应三种通往婚姻的真实路径

## 第一性原理

社会学里**真正导向长期婚姻**的相遇机制本质只有三种。任何交友产品如果不解决这三种，就只是在做 swipe app（数据上结果最差的一种）。

| 路径 | 机制 | 长期成功率 |
|---|---|---|
| A. 被了解你的人**引荐** | 第三方同时了解双方 | 历史上婚姻最大来源 |
| B. 在共同**做的事**里反复遇到 | propinquity + 高频接触 | 离婚率最低 |
| C. **价值观与人生观**对齐 | 对"如何生活"的根本看法一致 | 婚姻研究公认最强预测因子 |

三个 Agent 一对一映射 A / B / C。多一个是凑数，少一个漏本质。

## 上一版的修正

- **Companion → Side by Side**：机制对，名字错。"Companion" 太泛（伴侣本身也叫 companion），不能体现"通过共同活动反复见面"这个机制。"Side by Side" 直接命名机制本质：不是面对面相亲，是肩并肩做一件事。
- **Curator → Compass**：机制完全换掉。书/展/音乐是**别人的表达**，不是你的表达。共同审美 ≠ 共同价值观（爱《海街日记》未必想要平淡家庭）。在 A/B/C 里无法对应任何一种，所以你感觉不到价值是对的。Compass 改为**对齐价值观**的 Agent。

## 三个 Agent（最终）

### Matchmaker · 对应 A（引荐）

不变。AI 作为不知疲倦的中性引荐人。
- 入口问题："你想找一个什么样的人？"
- 右侧产物：一个人 + Agent 写的引荐角度（angles）
- 主动作：Tell me more / Pass

### Side by Side · 对应 B（共同活动）

不变。AI 直接安排一次真实见面。
- 入口问题："你常做什么活动？"
- 右侧产物：一次具体的见面提议（人 + 活动 + 时间 + 地点）
- 主动作：**Accept / Not this one**
- 约束：每周最多 1 次提议、双向匿名 opt-in、见面前不解锁聊天、必须有现成活动锚点

### Compass · 对应 C（价值观，全新机制）

**机制：**
- Agent 在主对话里每次抛**一个**开放的人生问题（不是问卷，不是选项）。例：
  > "如果不用工作，下个月你最想做什么？"
  > "家对你来说是地点，还是某些人？"
  > "你愿意为爱情让步什么、不会让步什么？"
- 用户用**自己的话**回答。Agent 原样保存。
- 当另一个用户对同一问题给出语义共鸣的答案时，右侧呈现：

```text
You both answered:
"What does home mean to you?"

You wrote:                       She wrote:
"Home is wherever I can          "I think home is two or three
cook dinner without my           people I can be quiet with.
phone."                          Not a place."
```

- **先没有头像、没有名字、没有标签、没有兴趣云。** 只有两段文字。
- 用户点 "I want to know who wrote this" 后才显示对方身份。
- 主动作：I want to know who wrote this / Skip

**为什么这才对应 C：**
- 价值观必须从**自己的表达**里读，不能从消费内容里推断。
- 开放问题反 gaming：选项可以装，自由文字里的语气、关注点、用词暴露真实优先级。
- 三个 Agent 里**唯一不依赖外部数据**——不需要活动、不需要偏好描述，只需要你愿意 30 秒认真答一个问题。
- 与 Matchmaker 根本不同：Matchmaker = 你描述 TA，Compass = 你们俩各自描述自己，系统找共鸣。

## 三 Agent 横向对照

| | Matchmaker | Side by Side | Compass |
|---|---|---|---|
| 路径 | A 引荐 | B 共同活动 | C 价值观 |
| 入口问题 | 想找什么样的人 | 常做什么活动 | 慢慢答一个问题 |
| 右侧产物 | 一个人 + 引荐语 | 一次见面提议 | **两人对同一问题的两段答案并排** |
| 主动作 | Tell me more | **Accept / Not this one** | I want to know who wrote this |
| 节奏 | 一次一个 | 每周最多 1 次 | 一次一对答案 |
| 输入难度 | 中（要会描述） | 低（说做什么） | 低（一次一问） |
| 适合的用户状态 | 想清楚要什么 | 不想多说、想动起来 | 还没想清楚要什么 |

互不隶属、共享候选池、共享偏好理解（一个 Agent 学到的会让另两个打分更准，但流程不交叉）。

## 首页

```text
Kindred — Three ways someone meaningful might come into your life.

┌─────────────┐  ┌──────────────┐  ┌─────────────┐
│ Matchmaker  │  │ Side by Side │  │ Compass     │
│             │  │              │  │             │
│ Describe    │  │ Meet over    │  │ Find someone│
│ who you're  │  │ something    │  │ who thinks  │
│ looking for │  │ you both do  │  │ like you do │
└─────────────┘  └──────────────┘  └─────────────┘
```

每个 Agent 进去都是统一布局：左对话 / 右画面。

## 实现要点

**数据（`src/lib/people.ts`）：**
- `activities[]`：种类、水平、片区、固定时段（供 Side by Side）
- `reflections[]`：`{ questionId, answer }`——12 人 × 每人对 4–6 个问题的自由作答（供 Compass）
- 现有 `angles` / 偏好字段供 Matchmaker

**新增 `src/lib/questions.ts`：** 20 个 Compass 用的人生问题（双语），按主题分组（家、时间、钱、家庭、孤独、改变）。

**三个 Agent 模块：**
- `src/lib/agents/matchmaker.ts`（整理现有 agent.ts）
- `src/lib/agents/side-by-side.ts`：核心 `proposeMeet()`——活动+时段+片区三向交集 + 偏好打分
- `src/lib/agents/compass.ts`：核心 `findResonance(userAnswer, questionId)`——简单的关键词/情感词重叠 + 长度匹配模拟"语义共鸣"。状态：`asking` → `awaiting_answer` → `searching` → `resonance_found`

**共享：** `src/lib/understanding.ts`

**路由：** `/` · `/matchmaker` · `/side-by-side` · `/compass`

**组件：**
- `home.tsx`（三入口）
- `workspace.tsx`（左对话/右画面骨架，三个 Agent 共用）
- `canvas/intro-canvas.tsx`（Matchmaker）
- `canvas/meet-canvas.tsx`（Side by Side）
- `canvas/resonance-canvas.tsx`（Compass：两段答案并排）

**删除：** `scribe`、`inbox-pane`、`letter-composer`、旧 `curator` 思路相关代码、过时单 Agent `chat.tsx`。

**i18n：** 三个 Agent 的所有文案 + 20 个人生问题双语。强制首帧英文以避免 hydration mismatch。

## 自检

- ✅ 三个 Agent 对应三条真实通往婚姻的路径，不多不少。
- ✅ Side by Side 直接命名机制（共同做的事），不再用含义模糊的 Companion。
- ✅ Compass 真正解决价值观对齐——通过用户**自己的话**，不通过消费内容。
- ✅ 三种 Agent 对应三种用户状态（想清楚 / 想行动 / 还没想清楚），互补不重叠。
- ✅ 反 swipe：每个 Agent 一次只给一个产物，没有列表、没有刷新、没有百分比。

确认就 build。
