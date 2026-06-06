
# Bloom — 第三版重设计计划

完全替换 Muse 的暗色克制风格。新方向：**春日般明亮的、希望感的全屏对话首页**。

---

## 品牌

- **名称**：**Bloom**
- **Tagline**：*Tell us who you'd bloom with.*
- **副标题**：*Describe the person you hope to meet. We'll help you find them.*
- **语气**：温暖、轻盈、有希望感，但不卖萌。

---

## 配色（Spring Bloom · 浅底活泼）

写入 `src/styles.css` 的 `oklch` token：

| Token | 用途 | 颜色 |
|---|---|---|
| `--background` | 主背景 | 象牙白 `#FFFBF5` |
| `--foreground` | 正文 | 深玫瑰棕 `#3a1f24`（高对比，但不黑） |
| `--primary` | 主按钮/强调 | 鲜活珊瑚 `#FF7A8A` |
| `--primary-foreground` | 主按钮文字 | 白 |
| `--secondary` | 次要面/气泡 | 樱花粉 `#FFC9D2` |
| `--accent` | 点缀 | 嫩绿 `#A8D5A0` |
| `--muted` | 弱化背景 | 极浅奶粉 `#FFF1F3` |
| `--muted-foreground` | 弱化文字 | 暖灰 `#8c6d72` |
| `--ring` | 焦点环 | 珊瑚 `#FF7A8A` |

视觉氛围：
- 大背景柔和粉/桃/绿的散射光斑（径向渐变叠加）
- 圆角回到柔和（`rounded-3xl`、对话气泡 `rounded-2xl`）
- 阴影是粉色调的弥散柔光，不是黑色
- 字体：标题 **Fraunces**（衬线、温暖现代），正文 **Inter**
- 动效：花瓣式的字符 stagger、气泡淡入、按钮微呼吸

**完全移除**：黑底、金线、噪点纹理、Cormorant 字体、Noir & Gold tokens、所有 `--ink/--gold/--whisper/--paper` 命名。

---

## 信息架构（首页即对话）

| Route | Page | 说明 |
|---|---|---|
| `/` | **首页 = 全屏对话** | 上：Bloom 品牌名 + 一句 tagline；下：全屏对话框，进入即可输入 |
| `/portrait` | Your portrait | AI 整理出的散文段落，可编辑/重生成 |
| `/people` | People who'd bloom with you | 候选人卡片，无评分 |
| `/people/$id` | Person | 完整 portrait + Reach out |

**删除** `src/routes/describe.tsx`——首页本身就是 describe。`/describe` 不再存在。
**删除** `src/routes/index.tsx` 旧的 Landing。
导航变为 3 项：**Home（聊天）/ Portrait / People**。

---

## 首页布局（全屏对话）

```text
┌─────────────────────────────────────────────────┐
│  Bloom              Portrait   People           │ ← 极简顶部
│  ─────────────────────────────────────────────  │
│                                                 │
│                                                 │
│      Tell us who you'd                          │
│      bloom with.                                │ ← 大标题
│                                                 │
│      [Muse 气泡] Hi — describe the person       │
│      you hope to meet, in your own words. 🌷    │ ← 首条 Bloom 消息
│                                                 │
│      [你的回复区...]                            │
│                                                 │
│                                                 │
│   ┌───────────────────────────────────────┐    │
│   │ Someone who notices things...         │    │ ← 输入框（自动聚焦）
│   │                          [Send 珊瑚色] │    │
│   └───────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
```

- **进入即输入**：页面加载后输入框自动聚焦，第一条 Bloom 消息已显示。
- 没有 "Begin" 按钮、没有三步说明、没有 hero CTA。
- 对话推进同样是 Hybrid：自由文本 → 3 个轻提问 → 生成 portrait → 出现 "See people" 按钮。
- 完成对话后顶部出现一个浮动 CTA 条："Your portrait is ready · Read portrait / Meet them →"

---

## 对话气泡视觉

- **Bloom 消息**：左对齐，樱花粉气泡 `bg-secondary`，深玫瑰文字，左侧有一个小花朵图标（用 `lucide-react` 的 `Flower2` 或 `Sparkles` 都可以，确认用 `Flower2` 更切题）
- **你的消息**：右对齐，珊瑚色气泡 `bg-primary text-primary-foreground`
- **typing**：三个粉色小圆点跳动 + 一句斜体灰字 "Bloom is listening..."

---

## 复用 vs 重写

保留并复用：
- `src/lib/types.ts`（仅把品牌相关字符串中性化，结构不变）
- `src/lib/conversation.ts`（FOLLOW_UPS / OPENING / extractSignals / collectSignals）——只更新文案里的品牌词
- `src/lib/portrait.ts`（散文生成器，不变）
- `src/lib/people.ts`（12 个英文人物，**保留**）
- `src/lib/resonance.ts`（共鸣推荐，不变）
- `src/lib/store.ts`（localStorage 键名从 `muse:*` 迁移到 `bloom:*`，自动清理旧键）

重写：
- `src/styles.css`（Spring Bloom tokens）
- `src/components/app-shell.tsx`（明亮版顶部 + 移动端底部 nav）
- `src/routes/__root.tsx`（标题文案 + 字体改回 Fraunces + Inter）
- `src/routes/index.tsx`（**全屏对话首页**——由旧 describe 改造而来）
- `src/routes/portrait.tsx`（明亮版样式，逻辑不变）
- `src/routes/people.tsx`（明亮卡片）
- `src/routes/people.$id.tsx`（明亮详情）

删除：
- `src/routes/describe.tsx`（合并到首页）

---

## 风险与说明

- 旧的 `muse:*` localStorage 数据启动时自动清空并迁移到 `bloom:*`。
- 仍为纯前端 mock 体验：无后端、无真实 LLM、无登录。
- 候选人池仍是手写的 12 个英文人物，保持原样。
