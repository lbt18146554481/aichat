## 定位调整

这是**演示 demo**，不做真实的信号交集算法。目标是让用户在匹配卡上**看到"为什么是 TA"的效果**，感受到产品把决策焦点从"事+时间"搬到了"人"。

## 卡片改版（视觉不变，数据造）

```text
┌────────────────────────────────┐
│  TA 卡片 · 你卡片                │
├────────────────────────────────┤
│  ★ 为什么是 TA                  │  ← 新增，最显眼
│  TA 也 安静、爱读书——你说过     │
│  这是你想遇到的人。              │
├────────────────────────────────┤
│  对上的是 网球 · 周六上午        │  ← 原 aligned 框降级
├────────────────────────────────┤
│  [开始聊 TA]  [看下一个]         │
└────────────────────────────────┘
```

信息层级：**人 > 事 > 时间**。

## 演示怎么造

**每个候选 Person 预挂一句 `whyPersonLine`**（写死在 `PEOPLE` 数据里，中英各一份），比如：

| Person | whyPersonLine (zh) |
|---|---|
| Person A | 「TA 也 **安静**、**爱读书**——你说过这是你想遇到的人。」 |
| Person B | 「TA 的节奏和你一样慢——你说过想遇到不赶时间的人。」 |
| Person C | 「TA 和你告诉过 Agent 的偏好没有直接重叠——先看 TA 自己怎么说的。」下方引一句 TA 的 Moment |

演示时 `WhyPersonBox` 只做一件事：读 `person.whyPersonLine[locale]` 直接渲染。零算法。

**"看下一个"轮换** demo 效果：点一下换到下一个 Person，"为什么是 TA"整句跟着换 → 用户直接感受到"每个人有独立的匹配理由"这件事。

**"完全没告诉过 Agent"这一态怎么演示：** 加一个 URL query `?fresh=1`（或首次进入检测 understanding 为空）时，`WhyPersonBox` 显示 fallback 态：

> 「Agent 还没听你说过想遇到什么样的人。」
> [ 想遇到什么样的人？一句话就够 →]

用户在小 input 里随便打一句、回车 → **假装**"Agent 听懂了" → 切换到正常的 `whyPersonLine`。内部不做 `digest()`，只 setState 一个 `hasTold = true`。

## 明确不做

- ❌ 不写 `buildPersonReason()` 交集算法
- ❌ 不读 `understanding.positive/negative`
- ❌ 不改 Matchmaker、不改匹配数据流
- ❌ 不改匹配算法

## 技术改动清单

| 文件 | 改动 |
|---|---|
| `src/lib/people.ts` | 每个 Person 加 `whyPersonLine: { en, zh }` 字段（3–5 个候选各写一句） |
| `src/components/canvas/meet-canvas.tsx` | 新 `WhyPersonBox`：读 `person.whyPersonLine`，无则显示 fallback + 内联 input；原 aligned 框降级为一行灰字 |
| `src/routes/side-by-side.tsx` | 加 `hasTold` state 支持 fallback→正常态的假切换 |
| `src/locales/{en,zh-CN}/common.json` | `intent.why_person_title`、`intent.tell_agent_placeholder` 等 3–4 条文案 |

改动集中在**匹配结果屏 + 数据文件挂几个演示句**，一天内可落地，演示效果和真实版一致。
