
# 第五版重设计 — ChatGPT 风的 AI 红娘

把现在的双栏 Agent 面板、品牌色块、装饰全部砍掉。直接对标 ChatGPT / Gemini 的形态：**左侧对话历史 + 中间主对话 + 输入框下方的 agent tag 行**。核心目的只有一个：帮用户找到另一半。

---

## 视觉方向

完全 ChatGPT/Gemini 极简风：
- 大量留白，灰阶为主，几乎没有强色彩
- 唯一强调色：近黑 `#0D0D0D`（按钮与发送键）
- 背景：纯白 `#FFFFFF`；侧栏：极浅灰 `#F7F7F8`
- 边框：`#E5E5E5`；次要文字：`#6B6B6B`
- 字体：Inter，单一字号体系，标题靠字重不靠字号膨胀
- 圆角中等：`0.5rem` 卡片、`1rem` 输入框、`9999px` chip
- 无渐变、无阴影炫技、无动画装饰

---

## 信息架构

| Route | 说明 |
|---|---|
| `/` | 主对话页（空态居中欢迎屏；有消息则正常滚动） |
| `/c/$chatId` | 单个会话页（同一组件，按 ID 加载消息） |
| `/people` | 红娘累计找到的候选人列表 |
| `/people/$id` | 单个候选人详情 |

**删除** `/portrait` 路由（画像作为对话产物，直接出现在聊天里，不再单独成页）。

顶部导航砍掉。所有导航靠左侧栏。

---

## 页面布局（桌面）

```text
┌──────────────────┬─────────────────────────────────────────┐
│  + New chat      │                                         │
│  ─────────────── │           Find your person              │
│                  │     What kind of partner are you        │
│  Today           │            looking for?                 │
│   · Quiet, kind  │                                         │
│   · Loves books  │   [建议 chip] [建议 chip] [建议 chip]    │
│                  │                                         │
│  Yesterday       │                                         │
│   · Someone who… │   ┌─────────────────────────────────┐  │
│                  │   │ Describe them...           [↑]  │  │
│  ─────────────── │   └─────────────────────────────────┘  │
│  ⚙  Settings     │   [+ Add agent]  People found (3) →    │
│  👤 You          │                                         │
└──────────────────┴─────────────────────────────────────────┘
```

**移动端**：侧栏默认收起，顶部一个汉堡按钮打开抽屉。主体全屏。

---

## 核心交互

1. **空态欢迎屏**：中央一句话 "Find your person." + 一行副标题 + 3 个建议 chip（点击直接填入输入框，例如 "Describe my ideal Sunday partner"、"Help me put words to a feeling"、"What kind of person fits a quiet life"）
2. **对话**：用户描述 → AI 红娘提 1～3 个轻问题 → 整理一段画像（直接显示在聊天里，作为一条 AI 消息）→ 自动追加一条带候选人卡片的消息（卡片可点击进 `/people/$id`）
3. **多会话**：每条对话独立存储；侧栏按日期分组列出；点击切换 = 路由跳转到 `/c/$chatId`；"New chat" 创建新对话并跳转
4. **Agent tag 行**：输入框正下方一行，初始只有 `+ Add agent` 按钮 + 一个右侧的 `People found (N)` 链接。点击 `+ Add agent` 弹个轻量弹窗让用户自己输入 agent 名称和一句描述，保存在本地。用户加的 agent 显示为 chip，可勾选/取消，被勾选时该 agent 的"风格"会在 mock 层附加到 AI 回复（例如附加一句签名）。**我不预置任何 agent**

---

## 数据与存储（纯前端 mock）

localStorage 键：
- `bloom:chats` — `{ id, title, updatedAt, messages: UIMessage[] }[]`
- `bloom:agents` — 用户自定义的 agent 数组 `{ id, name, description, enabled }[]`
- `bloom:people` — 红娘已找到的候选人累计列表（用于 `/people` 页与输入框下方计数）

会话标题：取第一条用户消息前 30 字。

仍无后端、无真实 LLM；候选人池继续用现有 `src/lib/people.ts`（12 人），匹配走 `resonance.ts`。

---

## 文件变更

**重写**：
- `src/styles.css` — 砍到只剩中性灰阶 token
- `src/routes/__root.tsx` — 文案换成 "Find your person"
- `src/routes/index.tsx` — 改为空态欢迎屏 + 转跳到 `/c/$chatId` 逻辑
- `src/routes/people.tsx` / `src/routes/people.$id.tsx` — 极简化重设
- `src/lib/store.ts` — 改成多会话存储 + agent 自定义存储

**新增**：
- `src/routes/c.$chatId.tsx` — 主对话页
- `src/components/chat-sidebar.tsx` — 左侧会话历史栏
- `src/components/chat-surface.tsx` — 主对话组件（空态/消息流/输入框/tag 行复用）
- `src/components/agent-tag-row.tsx` — 输入框下方的 tag 行 + 新建 agent 弹窗
- `src/lib/chats.ts` — 会话 CRUD
- `src/lib/custom-agents.ts` — 用户自定义 agent CRUD

**删除**：
- `src/components/app-shell.tsx`（顶部导航不再用，新结构由侧栏 + 主区直接组合）
- `src/components/agent-panel.tsx`、`src/lib/agents.ts`（旧的 4 个预设 agent 全砍）
- `src/routes/portrait.tsx`（合并到聊天内消息）

---

## 风险与说明

- 多会话与自定义 agent 都是 localStorage，关浏览器不丢，但跨设备不同步
- 仍然没有真实 LLM；AI 回复由本地脚本驱动，但呈现形态完全模仿真实对话
- 候选人作为聊天里的内嵌卡片，是这次产品意义上最大的变化（之前是分离页面）
