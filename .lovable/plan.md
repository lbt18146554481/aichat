# 重做方案：从"红娘"到"搜索智能体"

## 一、定位重置

**产品本质**：一个 AI Agent，用户用自然语言描述想要的人，Agent 在档案库里检索、推理、给出候选；没有名字、不拟人、不卖人设。

**词汇黑名单（全站搜索并清除）**：红娘、matchmaker、Iris、Bloom、Muse、"为你介绍"、"我手上有的人"等任何拟人化措辞。

**新文案口径**（中性、工具感）：
- 不说"我帮你介绍 X"，说"Found 1 profile matching your description"
- 不说"想多了解 / 不是我的菜"，说"Save" / "Dismiss"
- Agent 自称一律用 "the assistant" 或直接用第三人称动作（"Searching…", "Refining query…"）

## 二、产品名候选

为避免再返工，产品名先用工作名 **Kindred**（中性、国际化、非花名），实施时如果你想换我随时改字符串。

## 三、首版功能范围

| 页面 | 内容 |
| --- | --- |
| `/` 主界面 | 全屏对话 + 输入框；空状态展示一行提示和 3 个示例 query chip |
| 内嵌候选卡 | Assistant 回复里直接渲染 ProfileCard（头像 / 姓名 / 年龄 / 城市 / 一句话摘要 / Save / Dismiss / View） |
| `/profile/$id` | 完整档案详情页，"Back to search" 返回对话 |
| 顶部右侧 | 语言切换器（EN / 中文，更多预留），Saved 计数入口 |
| Saved 抽屉 | 显示用户 Save 过的档案，可移除 |

**不做**：登录、多会话历史、Agent 团队面板、付费、点对点聊天。

## 四、Agent 行为（纯前端 mock，无 LLM）

状态机三阶段，措辞全部工具化：

```text
idle ── user query ──▶ searching (打字指示 "Searching profiles…")
                          │
                          ▼
                     results (返回 1-3 张候选卡 + "Refine your search" 提示)
                          │
              ┌───────────┴───────────┐
       user refines              user dismisses/saves
              │                         │
              └──────────► searching ◀──┘
```

匹配逻辑沿用现有 `extractSignals` + `findResonant`：从用户输入提取标签 → 累积上下文 → 对档案库打分 → 返回 top N 未展示过的。

## 五、国际化（i18n）

- 库：`react-i18next` + `i18next-browser-languagedetector`
- 默认语言：浏览器语言（`navigator.language`），fallback `en`
- 首版语种：`en`、`zh-CN`；翻译文件 `src/locales/{en,zh-CN}/common.json`
- 所有 UI 文案、Agent 系统话术（"Searching…", "Found N profiles", "No more matches, try refining your query"）全部走 `t()`
- Mock 档案库的 `name / city / occupation / portrait` 各加一个 `_zh` 字段，按当前语言渲染
- 语言切换器持久化到 `localStorage.lang`

## 六、视觉

延续上一版的中性极简方向（白底、深灰文字、单一强调色），但去掉一切"温暖治愈"暗示：

- 字体：Inter（UI）+ JetBrains Mono（Agent 状态行小字，强调工具感）
- 强调色：`oklch(0.55 0.15 250)` 冷蓝
- 候选卡：白底 + 1px border，无渐变无阴影；hover 时 border 变深
- Agent 消息：无气泡、左对齐纯文本；用户消息：浅灰圆角气泡右对齐
- 加载态：单行 monospace 文字 `▍ Searching profiles…` 光标闪烁，不用三点跳动

## 七、需要删/改/新增的文件

**删除**
- `src/components/iris-chat.tsx`、`iris-header.tsx`、`candidate-card.tsx`
- `src/lib/iris.ts`、`src/lib/portrait.ts`（散文画像不再需要）
- `src/assets/iris-avatar.png`

**新增**
- `src/lib/i18n.ts` — i18next 初始化
- `src/locales/en/common.json`、`src/locales/zh-CN/common.json`
- `src/lib/agent.ts` — 工具化状态机（取代 `iris.ts`）
- `src/components/chat.tsx`、`profile-card.tsx`、`app-header.tsx`、`lang-switcher.tsx`、`saved-drawer.tsx`

**改写**
- `src/lib/people.ts` — 每条档案补 `_zh` 双语字段
- `src/routes/index.tsx` — 渲染新 `Chat`
- `src/routes/people.$id.tsx` → `src/routes/profile.$id.tsx`，文案改为中性
- `src/routes/__root.tsx` — `<html lang>` 跟随当前 i18n，title 改为产品名
- `src/styles.css` — 清理旧温暖色 token，换冷蓝强调色

**保留**
- `src/lib/conversation.ts`、`src/lib/resonance.ts`、`src/lib/types.ts`（信号提取与匹配逻辑仍然有用）
- `localStorage` key 全部迁移到 `kindred:*`，启动时清理旧 `iris:* / bloom:* / muse:*`

## 八、验收清单

1. 全站 grep 不到「红娘 / matchmaker / Iris / Bloom / Muse」
2. 浏览器语言为中文时首屏中文，为英文时首屏英文；右上角切换即时生效
3. 第一次输入 → 出现 monospace 加载行 → 返回 1-3 张候选卡
4. Save / Dismiss 后下一条 query 不再重复出现该档案
5. 详情页可直接通过 URL 访问并按当前语言渲染

确认后我进入 build 模式按此执行。
