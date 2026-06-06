
# 第四版重设计 — 精致科技风 + Agent 团队

完全替换 Bloom 的春日粉色方向。新方向：**简约、克制、中性的科技公司视觉**（参考 Linear / Vercel / Stripe），首页保留全屏对话，但侧栏新增 Agent 团队面板。

---

## 品牌

- **名称**：保留 **Bloom**（如需换名再告知）
- **Tagline**：*Your AI team for finding the one.*
- **语气**：克制、可信、不浮夸、不甜腻。男女通用。

---

## 配色（中性科技风 · 浅底）

写入 `src/styles.css`：

| Token | 用途 | 颜色 |
|---|---|---|
| `--background` | 主背景 | 近白 `#FAFAFA` |
| `--foreground` | 正文 | 近黑 `#0A0A0A` |
| `--card` | 卡片面 | 纯白 `#FFFFFF` |
| `--primary` | 强调/按钮 | 深墨 `#111111` |
| `--primary-foreground` | 主按钮文字 | 白 |
| `--secondary` | 次要面 | 浅灰 `#F4F4F5` |
| `--muted` | 弱化背景 | `#F4F4F5` |
| `--muted-foreground` | 弱化文字 | 中灰 `#71717A` |
| `--accent` | 唯一点缀色 | 克制蓝 `#2563EB`（仅用于状态、链接、Agent 工作指示） |
| `--border` | 描边 | `#E4E4E7` |
| `--ring` | 焦点环 | `#2563EB` |

视觉氛围：
- **去掉**所有粉色径向渐变背景、`shadow-bloom`、`shadow-petal`、`gradient-coral`、`text-gradient-bloom`、`breathe`、`Flower2` 图标
- 阴影改为标准中性 `0 1px 2px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.06)`
- 字体：标题与正文统一 **Inter**（去掉 Fraunces；标题靠字重 600 + 紧字距，不靠衬线）
- 圆角统一 `--radius: 0.75rem`
- 气泡：用户消息 = 深色实底，Agent 消息 = 白底 + 1px 描边

---

## 信息架构

| Route | Page | 说明 |
|---|---|---|
| `/` | **首页 = 左侧 Agent 团队面板 + 右侧全屏对话** | 桌面端两栏，移动端 Agent 面板折叠成顶部抽屉 |
| `/portrait` | Your portrait | AI 整理的散文段落（沿用，重设样式） |
| `/people` | People | 候选人卡片（沿用，重设样式） |
| `/people/$id` | Person | 详情（沿用，重设样式） |

导航：**Chat / Portrait / People**（保留 3 项，去掉花朵图标，使用 lucide 的 `MessageSquare / User / Users`）。

---

## Agent 团队（核心新增）

定义 4 个 Agent，作为左侧固定面板。每个 Agent 是一张小卡：圆形头像（首字母 monogram，无情绪化色彩）+ 名字 + 一行职责 + 当前状态点（idle / working / done）。

| Agent | 职责 | 何时激活 |
|---|---|---|
| **Portrait** | 把你说的内容整理成一段画像 | 用户完成 3 个 follow-up 后 |
| **Scout** | 在候选人池中寻找契合的人 | Portrait 完成后 |
| **Spark** | 为你与候选人之间生成一个自然的破冰开场 | 进入某个候选人详情时 |
| **Coach** | 给约会与沟通的轻量建议 | 用户在详情页点击 "Get advice" |

**注意**：本期仍为纯前端 mock，Agent 状态机由本地脚本驱动，不接 LLM。Agent 卡片点击会展开一行说明 + "Activated by Bloom"。

---

## 首页布局

```text
┌──────────────────────────────────────────────────────────────┐
│  Bloom                              Chat  Portrait  People    │
├────────────────┬─────────────────────────────────────────────┤
│ Your AI team   │                                             │
│                │  Tell us who you'd like to meet.            │
│ ● Portrait     │                                             │
│   Idle         │  [Bloom] Hi — describe the person you...    │
│                │                                             │
│ ● Scout        │  [You] Someone who notices small things...  │
│   Idle         │                                             │
│                │  ...                                        │
│ ● Spark        │                                             │
│   Idle         │  ┌─────────────────────────────────────┐   │
│                │  │ In your own words...           [↑]  │   │
│ ● Coach        │  └─────────────────────────────────────┘   │
│   Idle         │                                             │
└────────────────┴─────────────────────────────────────────────┘
```

- 桌面：左栏宽 `280px`，右栏对话占满。
- 移动：Agent 面板收成顶部一行可横滑的 chip + 一个 "Team" 按钮打开抽屉。
- 对话推进时，相应 Agent 卡片状态点变蓝并显示 "working..."；完成后变绿勾。

---

## 文件改动

**重写**：
- `src/styles.css` — 全新中性科技 token，删除所有粉色/花朵相关 utility
- `src/routes/__root.tsx` — 字体只留 Inter，标题/描述去花朵化
- `src/components/app-shell.tsx` — 顶部导航换图标、去渐变
- `src/routes/index.tsx` — 改为两栏布局，引入 AgentPanel；气泡样式换中性
- `src/routes/portrait.tsx` — 重设样式
- `src/routes/people.tsx` — 卡片改纯白 + 描边
- `src/routes/people.$id.tsx` — 详情重设，加 "Activate Spark" / "Ask Coach" 入口

**新增**：
- `src/lib/agents.ts` — Agent 定义（id/name/role/icon-letter）+ 状态机类型
- `src/components/agent-panel.tsx` — 左侧/抽屉式面板
- `src/components/agent-card.tsx` — 单个 Agent 卡

**保留不动**：
- `src/lib/conversation.ts` / `portrait.ts` / `people.ts` / `resonance.ts` / `types.ts` / `store.ts`（仅在 store 里增加 `bloom:agents` 状态键）

**删除**：
- 无需删文件；之前的 `src/routes/describe.tsx` 已不存在
- 顺手清理 styles.css 中：`--blossom / --coral / --leaf / --cream / shadow-bloom / shadow-petal / gradient-coral / text-gradient-bloom / breathe` 等粉色资产

---

## 风险与说明

- 仍为纯前端 mock，无 LLM、无后端、无登录。
- Agent 状态由对话阶段触发，本地状态机驱动，刷新后从 localStorage 恢复。
- 修复运行时错误：`routeTree.gen.ts` 中已无 describe 路由引用，本次重写会让构建重新生成稳定。
