## 认清本质

这是什么产品？**一个帮用户在候选人数据库中找到理想伴侣的 AI Agent。**

不是聊天玩具，不是红娘人设，不是花哨的设计实验。用户的核心 Job-to-be-Done 只有一件事：
> "用自然语言描述我想要的人 → Agent 理解 → Agent 从数据库筛出最匹配的人 → 我能查看、保存、迭代。"

所有不服务这条主线的元素都要删掉。

## 此前问题的根因

1. **过度中文化**：默认语言、示例、文案都偏向中文语境，丢了国际化产品该有的克制英文 voice。
2. **Agent 感缺失**：之前做成了"对话框 + 卡片"，没有让用户看到 Agent 在"思考、搜索、筛选、解释"的工作过程——这正是 AI Agent 产品区别于普通搜索的核心价值。
3. **设计不够克制**：装饰、动画、文案噪音过多，遮蔽了产品主线。

## 重新定位

**产品名**：`Kindred`（保留，中性、国际化、含义贴切——"同类、知己"）
**Tagline**：`Find someone who fits.`
**默认语言**：English。中文为可选切换，不再做翻译腔的本地化营销。
**目标用户感知**：像在用 Linear / Raycast / Perplexity——专业工具，不是相亲 App。

## 视觉方向（极简，不再反复换风格）

- 纯白背景 `#FFFFFF` / 深灰前景 `#0A0A0A`，单一中性灰阶
- 唯一强调色：克制的靛蓝 `oklch(0.55 0.18 260)`，仅用于 Agent 状态点、主按钮、链接
- 字体：`Inter` 全局 + `JetBrains Mono` 用于 Agent 动作行（强化"工具感"）
- 无渐变、无大圆角、无装饰插画、无 emoji
- 间距大方、字号克制（base 15px），所有交互元素遵循同一 8px 网格

## 核心界面（只有两屏）

### 1. `/` — Agent 工作台（单页主体验）

```text
┌────────────────────────────────────────────────────┐
│  Kindred                            Saved · EN/中  │
├────────────────────────────────────────────────────┤
│                                                    │
│  Describe who you're looking for.                  │
│  ─────────────────────────────────                 │
│                                                    │
│  [ Agent transcript: 用户消息 + Agent 行动/结果 ]   │
│                                                    │
│   › thinking…                                      │
│   › parsed criteria: age 26–32, reader, Berlin     │
│   › searching 1,284 profiles                       │
│   › 6 matches found                                │
│   ┌──────────────┐ ┌──────────────┐                │
│   │ Profile card │ │ Profile card │  …             │
│   └──────────────┘ └──────────────┘                │
│                                                    │
├────────────────────────────────────────────────────┤
│  [  Tell the agent more…                      ⏎  ] │
└────────────────────────────────────────────────────┘
```

**关键设计决策：**
- **Agent transcript** 使用 AI Elements (`Conversation` / `Message` / `MessageResponse` / `Tool`)，符合官方 chat-ui 规范。
- 用户消息：右对齐 + `primary` 背景气泡。Agent 消息：无背景，纯文本。
- **Agent 行动行**（mono 字体、`›` 前缀、muted 颜色）作为 `Tool` 组件内联渲染——让用户清楚看到 Agent 在做什么（解析、搜索、排序），这是产品的灵魂。
- 候选人卡片直接作为 Agent 消息的一部分内联出现（不弹窗、不跳页）。每张卡极简：头像、名字+年龄+城市、一行 essence、Save / Pass 两个文字按钮。
- 空状态：标题 + 3–4 个英文示例 chip（"a calm reader in their late 20s"、"someone who builds things on weekends"…），点击即填入输入框。
- 输入框始终自动聚焦；发送后保持聚焦。

### 2. `/profile/$id` — 候选人详情

简单到极致：左侧人像，右侧分段文字（essence / what they love / what they're looking for），底部 Save / Back。无地图、无标签云、无进度条。

**Saved 抽屉**从 Header 右侧滑出，列表式查看已收藏。

## 删除的东西

- 所有"红娘 / matchmaker / Iris / Muse / Bloom / 小荷"残留命名
- 候选人卡片上的"匹配度 %"
- 多 session / 历史侧栏（一次对话即一次搜索，刷新可重置）
- 自定义 Agent tag 行（功能噪音）
- 中文为默认 + 翻译腔文案
- Framer Motion 的装饰性动画（仅保留消息淡入与卡片渐显两处）

## 技术要点

- 使用 AI Elements 组件：`bun x ai-elements@latest add conversation message prompt-input tool shimmer`
- `src/lib/agent.ts`：保留并简化为脚本化 agent，输出结构化 `actions[]`（`parse | search | rank | present`），每个 action 在 UI 中以 `Tool` 渲染（默认折叠）
- `src/lib/people.ts`：候选人改为以英文为 primary，`zh` 字段降级为可选
- `src/lib/i18n.ts`：默认 `en`，去掉自动 detector（避免中文 OS 用户被强制中文，也修复当前 SSR hydration mismatch）
- 修复 hydration 错误的根因：i18n detector 在 SSR 与客户端语言不一致 → 固定服务端/客户端初始语言为 `en`，挂载后再让用户切换
- 路由保持：`/`、`/profile/$id`，删除其他遗留
- 提交前自检 chat-ui-composition：assistant 消息无背景、submit 按钮在 footer、logo 不用 Sparkles

## 交付范围

1. 拆除残留组件与文案
2. 安装并接入 AI Elements
3. 重写 `Chat` 工作台（含 Agent action 行的 Tool 渲染）
4. 重写 `ProfileCard` 与 `/profile/$id`
5. 修复 i18n hydration bug（默认 en，手动切换）
6. 视觉 token 收敛到单一灰阶 + 一种强调色

完成后页面看上去像一个**严肃的 AI 工具**，而不是一个相亲小程序。
