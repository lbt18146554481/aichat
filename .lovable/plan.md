# AI 红娘约会平台 - 纯前端版计划

## 产品概述
一个完全前端运行的约会平台 MVP。用户进入后**直接与"AI 红娘"对话**，通过脚本化的互动收集信息，生成个人档案，并展示预置的匹配候选人列表。全程无需后端，所有状态通过 localStorage 持久化。

---

## 页面路由与结构

| 路由 | 页面 | 说明 |
|------|------|------|
| `/` | 落地页 | Hero + 三步流程说明 + "开始聊聊" 按钮 |
| `/chat` | AI 红娘对话 | 全屏对话界面，脚本化多轮对话 |
| `/profile` | 我的档案 | AI 自动总结的个人画像卡片，可编辑 |
| `/matches` | 匹配列表 | 候选人卡片网格，含契合度与推荐理由 |
| `/matches/$id` | 候选人详情 | 完整档案 + "打招呼"按钮（首版仅 UI） |

---

## 核心功能设计

### 1. 脚本化 AI 对话（非真实 LLM）
- AI 红娘按**固定脚本**逐步提问，覆盖：昵称 → 年龄/城市 → 兴趣爱好 → 性格描述 → 择偶偏好
- 每轮根据用户输入内容生成拟人化回复（预置回复库 + 关键词匹配）
- 右上角显示信息收集**进度条**
- 当信息足够后，出现"生成我的档案"按钮
- 对话历史 + 收集到的字段全部存 localStorage

### 2. 个人档案生成
- 收集完成后，AI "自动总结"（客户端规则拼接生成档案文案）
- 展示：昵称、年龄、城市、兴趣标签、性格标签、自我介绍、择偶偏好
- 支持编辑基本信息，编辑后重新生成匹配列表

### 3. 匹配列表
- 30 个预置 mock 候选人档案，含不同城市、年龄、兴趣组合
- 匹配算法：客户端计算标签重叠度 + 城市匹配 → 契合度百分比
- 每个候选人展示 AI 生成的"推荐理由"（基于标签重叠客户端渲染）
- 卡片网格布局，点击进入详情

### 4. 候选人详情
- 完整档案展示
- "向 TA 打招呼"按钮 → Toast 提示"后续版本将支持私聊功能"

---

## 技术方案（纯前端）

| 层 | 技术 |
|---|---|
| 框架 | TanStack Start + React 19 + Tailwind v4 |
| UI 组件 | AI Elements（Conversation / Message / PromptInput / Shimmer） |
| 动效 | Framer Motion |
| 状态 | React state + localStorage |
| 字体 | Fraunces / DM Serif（标题）+ Inter（正文） |

### 无需引入
- ❌ Lovable Cloud / Supabase
- ❌ 后端 API / Server Routes / createServerFn
- ❌ 真实 LLM 调用（脚本化交互）
- ❌ 认证系统（首版无登录，匿名体验）

---

## 设计风格：温暖治愈

- **主色**：暖米白背景 + 蜜桃粉 `#F7A8B8` / 落日橘 `#F4A261` 主调 + 鼠尾草绿 `#A8C5A2` 点缀
- **色板**：全部使用 oklch 定义在 `src/styles.css` 语义 token 中
- **字体**：标题 Fraunces 或 DM Serif Display（衬线），正文 Inter
- **圆角**：大圆角（`rounded-3xl`）为主
- **阴影**：柔和弥散阴影
- **动效**：消息淡入（0.3s ease-out）、按钮微呼吸、页面过渡滑动

---

## 数据模型（客户端）

```ts
// localStorage key: "red-threads-user"
interface UserProfile {
  nickname: string;
  age: number;
  city: string;
  interests: string[];
  personalityTags: string[];
  bio: string;
  preferences: {
    ageRange: [number, number];
    cities: string[];
    mustHaveTags: string[];
  };
}

// localStorage key: "red-threads-chat"
interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: number;
}

// 预置在代码中
interface Candidate {
  id: string;
  name: string;
  age: number;
  city: string;
  avatar: string; // 占位图或生成图
  interests: string[];
  personalityTags: string[];
  bio: string;
  matchScore: number; // 动态计算
  reason: string;     // 基于重叠动态生成
}
```

---

## 实施顺序

1. **设计 token + 全局样式** — 更新 `src/styles.css` 温暖治愈色板
2. **落地页** — Hero + 引导
3. **AI 对话页** — 脚本引擎 + AI Elements UI + 进度条
4. **档案页** — 展示 + 编辑表单
5. **匹配列表** — 卡片网格 + 动态评分
6. **候选人详情** — 档案 + 打招呼按钮
7. **全局导航** — 底部 Tab 或顶部导航栏

---

## 风险与说明

- 本版**不涉及真实 AI 调用**，对话为脚本化交互。后续如需接入真实 LLM，需引入后端 API。
- 无用户认证，所有数据仅保存在当前浏览器 localStorage 中。
- 候选人池为预置数据，无真实用户互动功能。