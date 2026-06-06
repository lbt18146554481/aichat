
# Muse — Redesign Plan

## 产品理念的根本转变

旧版是"AI 红娘给你做匹配"——AI 主导、你被动。  
新版是 **"Describe the person you're looking for. We'll find them."**  
用户主导：你说出心中那个人，AI 帮你把模糊的描述变成清晰的画像，然后从社区中找出最贴近的人。

不再有"红娘"、"小荷"、"匹配度"、"契合度百分比"这类说教式词汇。全英文、克制、电影感。

---

## 品牌

- **名称**：**Muse**
- **Tagline**：*Describe the one you're looking for.*
- **副标题/说明**：*A quiet way to find someone real, starting with the person you imagine.*
- **语气**：第二人称、低声、留白多。不喊口号，不用 emoji 堆砌。

---

## 视觉方向（Noir & Gold · 电影感）

| 维度 | 决定 |
|---|---|
| 调色板 | 深墨黑底 `#0b0b0c` / 暖象牙 `#f3ede1` / 古金 `#c9a84c` / 浅金 `#f0d78c` |
| 主字体 | **Cormorant Garamond**（标题，意大利体常用于点睛词如 *muse*, *imagine*） |
| 正文 | **Inter**（紧凑、克制） |
| 圆角 | 极小（`rounded-sm` 或锐角），打破上一版的"软糖感" |
| 质感 | 细金线分隔、噪点纹理叠加、轻微 vignette |
| 动效 | 文字逐字浮现、光标式 caret、淡入慢于上一版（0.6–0.9s） |
| 不要 | 渐变粉橘 / 大圆角 / 卡通图标 / Sparkles 图标 |

所有色票写入 `src/styles.css` 的 `oklch` token：`--ink`、`--paper`、`--gold`、`--gold-soft`、`--whisper`。

---

## 核心交互（"Describe-your-person" Hybrid）

```text
1. Landing：一句标题 + 一个光标在闪 + Begin
2. Open prompt：
   "Tell me about the person you hope to meet."
   —— 用户写自由文本（一段话即可，无字数下限）
3. AI 三个轻提问（基于用户文本动态选取，非固定脚本感）：
   · "What do you imagine doing together on a slow Sunday?"
   · "What would you want them to be unafraid of?"
   · "What's something small that would make you smile about them?"
4. AI 把用户的话浓缩成一段 Portrait（第三人称、散文式）：
   "Someone who reads on rainy afternoons, laughs at their own jokes,
    and isn't afraid of long silences..."
   用户确认 / 微调。
5. People：从社区里"找到了 6 个像 TA 的人"。
   —— 不显示百分比。改为一句话理由：
   "She also keeps a list of bookstores in every city she visits."
6. Person detail：完整 portrait + 一句"Reach out"（首版仅 UI）。
```

要点：
- 永远不出现"matching score / compatibility / 红娘 / 小荷"等词。
- AI 不"评分"，只"识别共鸣"（resonance）。
- 候选人称 *people*，不是 *candidates / matches*。

---

## 页面与路由（全部英文）

| Route | Page | 说明 |
|---|---|---|
| `/` | Landing | 一句话 + 闪烁光标 + "Begin" |
| `/describe` | The conversation | 自由文本 + 3 轻提问，单页流式 |
| `/portrait` | Your portrait | AI 浓缩出的散文段落 + 编辑 |
| `/people` | People like them | 6–12 个人的克制卡片列表 |
| `/people/$id` | Person | 完整 portrait + "Reach out" |

底部导航四项改为：**Home / Describe / Portrait / People**（全英文）。

---

## 数据模型（客户端，localStorage）

```ts
// muse:seeker
interface Seeker {
  rawDescription: string;          // 用户最初那段话
  followUps: { q: string; a: string }[];
  portrait: string;                // AI 浓缩出的散文段落
  signals: string[];               // 从文本里抽出的"信号词"
}

// muse:conversation
interface Turn { id: string; role: "you" | "muse"; text: string; t: number }

// 30 个预置 People（mock）
interface Person {
  id: string;
  name: string;          // 英文名：Iris, June, Hugo, Theo, Mira...
  age: number;
  city: string;          // 英文城市：Lisbon, Kyoto, Brooklyn...
  portrait: string;      // 一段散文式自我描述
  signals: string[];     // 关键词
  resonance: string;     // 客户端根据 signals 重叠生成的一句话理由
}
```

无评分。排序逻辑：信号词重叠数 → 取前 N，但**不向用户展示数字**。

---

## 技术方案（保持纯前端）

- 仍然 TanStack Start + React 19 + Tailwind v4
- AI Elements：`Conversation` / `Message` / `MessageResponse` / `PromptInput` / `Shimmer`（用于 "Muse is listening..." 状态）
- 动效：Framer Motion，字符级 stagger
- 头像：DiceBear `notionists` 或 `lorelei` 单色变体，统一上金色描边
- 仍然无后端、无 LLM、无登录

---

## 实施顺序

1. 重写 `src/styles.css`：Noir & Gold tokens、Cormorant + Inter、噪点背景、金线 utility
2. 重写 `src/components/app-shell.tsx`：英文导航、品牌名 *Muse*、移除 Heart/Sparkles
3. 重写 `src/routes/index.tsx`：极简 Landing
4. 新 `src/lib/conversation.ts`：自由文本 + 3 个动态 follow-up 的脚本引擎（替换旧 `chat-script.ts`）
5. 新 `src/lib/portrait.ts`：把 seeker 的回答拼接成散文 portrait
6. 重写 `src/lib/candidates.ts` → `src/lib/people.ts`：30 个英文 mock 人物，含散文式 portrait
7. 重写 `src/lib/matching.ts` → `src/lib/resonance.ts`：信号词重叠，输出一句话 resonance，不输出分数
8. 重写 `/chat` → `/describe`：AI Elements 组合，shimmer "Muse is listening"
9. 重写 `/profile` → `/portrait`：散文段落 + 编辑
10. 重写 `/matches` → `/people` 与 `/people/$id`：克制卡片，无百分比

旧的中文文件、`小荷` 品牌、`gradient-warm`、`peach/sunset/sage` token 全部移除。

---

## 风险与说明

- 完全替换上一版的视觉与文案，旧 localStorage key（`red-threads-*`）启动时会被清空并迁移到 `muse:*`。
- 仍为纯前端 mock 体验，无真实 AI、无登录、无后端。
- 候选人池为预置英文档案，散文式自述全部由我手写而非 LLM 生成。
