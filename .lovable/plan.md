
## 先独立把问题想清楚

你提的不是 UI 问题，是产品的**信息架构**问题。现在的设计有一个被我之前忽略掉的根本错误：

**"关于我"和"我在找谁"是两类完全不同的信息，被我塞进了同一个 Agent 对话里。**

这两类信息的性质、可信度要求、修改频率、对幻觉的容忍度都完全不同：

| 维度 | 关于我（identity） | 我在找谁（intent / taste） |
|---|---|---|
| 谁是真相来源 | **只有用户本人** | 用户的偏好 + 系统的归纳 |
| 出错的代价 | 极高——别人会基于此对你产生印象 | 低——下一轮对话可修正 |
| 修改频率 | 极低，年级别 | 经常，每次找人都可能微调 |
| 是否需要被他人看到 | 是，逐字展示 | 否，只用于内部打分 |
| 是否适合 LLM 归纳 | **不适合**——任何归纳都是失真 | 适合——本来就是模糊语义 |

→ 用 Agent 聊天收集"关于我"是错的。理由不是"技术幻觉"这个表面，而是：
1. **identity 信息必须由用户逐字确认**，归纳即失真。
2. 用户**没法回头审视/修改**自己在对话里说过的话。
3. **覆盖率没保障**——用户不知道还没说什么、漏了什么维度。
4. **冷启动断裂**——新用户进来第一件事就是被问"你是谁"，而最好的产品（Hinge）证明这件事用**结构化选择 + 自由作答**比纯聊天高效得多、留存率高得多。

→ 用 Agent 聊天收集"我在找谁"是**对的**。这本来就是模糊偏好的提取场景。

## 经典设计的验证

- **Hinge** 的核心创新就是这个分离：Profile 是结构化的 Prompts（从池中选 3 条 + 自己作答）+ Vitals + 照片；匹配端是另一回事。Hinge 的"deletion rate"（关系建立后注销账号）是 Tinder 的数倍，prompts 形态本身就是被验证的产品形态。
- **OkCupid** 早期的 Match Questions 也是结构化的，加了一个"对你来说有多重要"的权重维度——这是把价值观可比较化的关键设计，但**展示给别人看的不是这些题，而是用户自己写的 essay**。展示侧仍然是自由文本。
- **Aron 36 问** 是研究工具，不是产品；产品化的对应物就是 prompt 池。
- **Christian Rudder (Dataclysm)** 的核心数据结论：转化的不是"全面"，是"独特 × 真诚"。所以池子要大、提示要钩出具体性，但**写什么必须用户自己写**。

## 由此推出的产品结构

**两个完全分开的表面**，共用底层数据：

```text
┌─────────────────────────────────────────────────────┐
│  Profile  ——  "你是谁"                              │
│   结构化、可审、可改、由你逐字写、别人会看到的就是它 │
│   · Vitals（年龄/城市/职业）                         │
│   · Moments（从池子里选 3–5 条 prompt，自己作答）    │
│   · 一件"对你重要的作品"（书/影/乐/展，1 条 + 一句话）│
│   · Anchors（3–5 条带权重的价值取向题，OkCupid 式）  │
│   入口：右上头像 → Profile，独立路由 /profile        │
└─────────────────────────────────────────────────────┘
                       ↓ 作为信号源喂给
┌─────────────────────────────────────────────────────┐
│  Matchmaker Agent  ——  "你在找谁"                   │
│   对话式，因为偏好是模糊的、需要协商                │
│   Agent 只读 Profile（不改），只写 Understanding     │
│   找到人 → 右侧画面显示对方的 Profile 卡            │
│   say hello 引用对方的 Moment + 写一句回应          │
└─────────────────────────────────────────────────────┘
```

**关键边界**：Matchmaker Agent **绝对不写入** Profile。Agent 写入的只有 `userMoments` 这种"我在找谁"侧的语义，并且每条新归纳都必须**用 chip 显示在 understanding 面板里、用户可一键删除**——这套机制现在已经有了，保留。

## Profile 的信息元素（最终版）

每一项都有取舍依据，不堆砌：

1. **Vitals**（必填，2 分钟）
   姓名 / 年龄 / 所在城市 / 职业一句话。这些是事实，结构化即可。

2. **Moments**（必填 ≥3，建议 5，每条 ≤140 字）
   从约 24 条 prompt 中挑选，自己作答。prompt 池分三档：
   - 行为类（"上次让你忘记时间的事"，"最近三个月你最常去的地方"）
   - 转变类（"最近一次你为什么改变了对某件事的看法"）—— Rudder 数据证明这类回答信息密度最高
   - 偏好类（"你愿意和一个陌生人聊到忘记看时间的话题"）
   每个 prompt 旁有**一句很短的示范**（不是模板答案，是"答这种问题时往哪个方向想"的提示），降低空白页焦虑。

3. **One Work**（必填 1）
   "一件这两年对你重要的书/电影/音乐/展览/比赛/食物"——任何形式都行，**加一句话为什么**。
   这一个字段独立出来是因为：共同审美是亲密关系里被低估但极强的信号（Helen Fisher 的研究里"共同感官偏好"是长期满意度的稳定预测变量），而且这是 Side by Side 之外另一条"非自我陈述"的吸引力来源。

4. **Anchors**（可选，最多 5 条）
   一组带权重的取向陈述（"我希望另一半也想要孩子" / "我不能接受异地超过半年" / "我希望对方有自己长期投入的事"）。仿 OkCupid Match Questions：每条选 **同意 / 中立 / 不同意 / 不重要**，但**不向他人展示**，只用于 Matchmaker 内部打分和过滤。
   这一项可选是因为它对匹配有用、对吸引无用，强制填写会拖慢冷启动。

明确**不做**的：
- ❌ 多张照片轮播——回到 Tinder。可上传一张作为头像，但不作为主要呈现。
- ❌ 兴趣标签云——已经被 Moments 替代，再加是重复。
- ❌ 自我描述长文（Bio）——已被 Moments 替代，自由文本框只会变成"努力把自己说得好"的表演场。
- ❌ MBTI / 星座 / 五大人格测试——伪科学化，且把人压回标签。

## 交互流程

**冷启动（首次进 App）**：一条单列的、可中途保存的引导流，**不是聊天**，是表单式的卡片串：

```text
Step 1  Vitals          (2 min, 4 个输入框)
Step 2  Pick 3 prompts  (从池里选，每选一个就地展开作答)
Step 3  One Work        (单输入 + 一句话)
Step 4  Anchors (可跳过)
        → 完成 → 进入首页
```

总长 5–8 分钟。每步右上有"稍后完成"，但 Step 1–3 完成前首页 Agent 入口处于 disabled 状态，并显示一句话："Matchmaker 需要先认识你——完成 Profile 才能开始。" 这是必要的硬约束，因为没有 Profile 就没有 Moments 可被引用，整个 say hello 闭环失效。

**日常修改**：右上头像 → `/profile` 独立路由。卡片化展示当前 Profile，每张卡可直接点开编辑。**所见即所得**——这一页看到的就是别人在 Matchmaker 里看到你的样子，顶部有一句话提示："This is exactly how others see you."

**Matchmaker 侧的变化**：
- Agent 第一句话不再是"告诉我关于你自己…"，而是直接基于已有 Profile 切入："I've read your profile. Tell me who you're hoping to meet." 这是把 Agent 用在它该用的地方。
- Agent 仍然可以在对话里追问偏好，但**不会**问"你喜欢什么书 / 你的爱好是什么"这类已经在 Profile 里有答案的问题。它读 Profile 作为上下文。
- 现在的 `userMoments` 收集逻辑从 Matchmaker 移除——它本来就属于 Profile。

## 解决了哪些具体问题

1. **幻觉**：identity 信息全部由用户逐字输入并可审，Agent 不再有机会把"我喜欢攀岩"误归纳成"她追求户外冒险"。
2. **可改性**：随时去 `/profile` 改任何一句话，不需要重启对话。
3. **覆盖完整**：进度条 + 必填项保证基础维度齐全；prompt 池保证表达深度。
4. **吸引力本质**：Moments + One Work 共同构成的"具体性"高于任何标签或自我描述，呼应上一版的研究结论。
5. **冷启动一致**：每个用户的 Profile 都有可比的最低厚度，Matchmaker 不会再因为另一边 Profile 为空而推出"这是个谜一样的人"。
6. **Agent 的边界**：Agent 只做它擅长的——模糊偏好的协商；不做它不擅长的——事实记录。

## 实施改动清单（落地时再展开）

**新增**
- 路由 `src/routes/profile.tsx` —— 编辑页 + 预览
- 路由 `src/routes/onboarding.tsx` —— 冷启动 4 步流（替代当前直接进 Matchmaker）
- `src/lib/profile.ts` —— Profile 类型、localStorage 持久化、completeness 检查
- `src/lib/prompts.ts` —— 约 24 条 prompt 池（中英双语，分行为/转变/偏好三档，每条带示范方向）
- `src/components/profile/*` —— PromptPicker / MomentCard / OneWorkCard / AnchorsCard / ProfilePreview
- 头像入口在 workspace-header 上

**改动**
- `src/lib/types.ts` —— `Person` 已有 `moments`，新增 `oneWork: { kind, title, why }`，给现有 24 个 mock 候选人补 oneWork 字段
- `src/lib/agents/matchmaker.ts` —— 移除 moment-collection 阶段；首句改为读 Profile；clarifying 只问"找谁"
- `src/components/canvas/intro-canvas.tsx` —— 在 3 张 Moment 卡之外再加一张 One Work 卡
- `src/lib/understanding.ts` —— 移除 `userMoments`（迁移到 Profile）
- `src/routes/index.tsx` —— 入口处先检查 Profile completeness，未完成则路由到 `/onboarding`
- `src/locales/{en,zh-CN}/common.json` —— Profile / onboarding / prompts 文案

**不动**
- Side by Side 的活动逻辑
- Matchmaker 的 say hello / connection 闭环
- understanding 的 positive/negative chip 机制（用于"找谁"侧）

## 验收

1. 第一次进 App 走的是 4 步表单引导，不是聊天框。
2. 任何时候去 `/profile` 都能看到并修改自己写的每一句话；预览页的样式 = 别人在 Matchmaker 里看到你的样式。
3. Matchmaker 第一句话引用了 Profile 内容，不再问"告诉我关于你"。
4. Matchmaker 对话中归纳出的偏好仍然以 chip 形式出现在 understanding 面板、可一键删除——但**不再**有任何 identity 信息被悄悄写入 Profile。
5. 候选人右侧画面除了 3 张 Moment 卡，还有 1 张 One Work 卡。
6. 整套 Profile 表单里**找不到**：照片轮播、兴趣标签、MBTI、长 bio 自由文本框。

---

如果你认同这个方向我落地。如果你认为 Anchors 这一项现阶段就不该上（怕复杂度），告诉我，我把它推到后续——Vitals + Moments + One Work 三件就足够撑起整个 say hello 闭环。
