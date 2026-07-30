## 要解决的两个问题

1. 右侧详情页现在只是「头像 + 一段 Moment」，没有回答用户唯一真正关心的问题：**为什么把这个人推给我**。
2. 点头像看到的资料页被 `In their words` / `Signals` 这类"归因标签"包裹，像系统在解释自己，而不是**这个人想让别人看到的样子**。

---

## 一、右侧匹配页：把「为什么是 TA」变成可计算、可归因的三条理由

页面结构收敛为三块（按钮区完全不动）：

```text
[头像 · 姓名 年龄 · 职业·城市]      ← 可点，打开资料页
------------------------------------
为什么是 TA
  · 同在 上海                        ← Profile.city ↔ person.city
  · 你说“想找安静一点的人” → TA 常去的地方是…   ← 你的原话 ↔ TA 的 Moment
  · 你们都在意 阅读 / 电影            ← 共同标签 / 共同 Favorites
------------------------------------
TA 自己写的一段（可点引用去打招呼）
------------------------------------
[Say hello] [Save] [看看别人]        ← 不改
```

### 理由必须有来源，只用这三类
| 理由类型 | 数据来源 | 缺失时 |
|---|---|---|
| 同城 | `Profile.city` ↔ `person.city` | 不显示该条 |
| 你说过的话对上了 TA 写的 | `understanding.notes`（用户在左侧说的原话）与 `person.moments` 的词重合，复用已有的 `pickBestMoment` 打分，展示时**左边是你的原话片段，右边是 TA 的原句** | 不显示 |
| 共同在意 | `Profile.favorites` ↔ `person.favorites`（kind/title）、`Profile` 兴趣标签 ↔ `person.signals` | 不显示 |

**没有任何一条成立时**：不编造，直接显示一行诚实的说明「还不太了解你的偏好 — 在左边多说一句，我会换更准的人」，并附一个跳转到左侧输入的建议。这也是引导用户补充信息的正确位置（在左侧 Agent 对话里说，不在右侧填表）。

### Profile 需要补的唯一字段
为了让"共同在意"这条能算出来，Profile 增加一个**轻量兴趣标签多选**（复用现有 `signal.*` 词表：阅读/电影/音乐/户外/做饭/艺术/安静/清晨…，最多选 5 个，可选填）。这是本次唯一新增字段，不加任何自由文本，保持资料页简洁。

---

## 二、公开资料页：展示"TA 想展示的东西"，去掉系统旁白

`PublicProfileSheet` 与详情页头部的改动：

- 删除 `In their words` / `Signals` / `Attribution` 一类系统标签（`attribution.self_words` 等 key 从两份 locale 移除）。
- 简介（bio）直接作为头部下方的一句话展示，不加前缀。
- Moments 用**问题本身**作小标题、下面是 TA 的回答 —— 问题即语境，不需要额外解释这是谁说的。
- Favorites 保持极简单行清单（类型 + 标题 + 一句为什么）。
- 兴趣标签作为一行灰色 chip 放在简介下方，无标题。
- 尊重 `Profile.hidden`：被隐藏的字段（头像/年龄/性别/取向/MBTI/bio/某条 moment/某条 favorite）在公开资料页一律不渲染 —— 这才是"TA 想展示的内容"的字面含义。
- 空态：某个分区没有内容就整块不渲染，不出现占位文案。

---

## 技术细节

- 新增 `src/lib/match-reasons.ts`：`buildReasons(person, profile, understanding, lang) => Reason[]`，每条 `{ kind, yourSide?, theirSide }`，纯函数、无副作用，供 `IntroCanvas` 使用（后续 `MeetCanvas` 可复用）。
- `IntroCanvas` 在头部与 Moment 之间插入 `WhyThisPerson` 子组件，最多渲染 3 条。
- `src/lib/profile.ts` 增加 `interests: string[]`（默认 `[]`，`loadProfile` 向后兼容），`profile-form.tsx` 增加一个 chip 多选段落。
- `PublicProfileSheet` 增加按 `hidden` 过滤的逻辑；demo Person 无 hidden 字段，按全部可见处理。
- locale：新增 `why.same_city` / `why.you_said` / `why.shared` / `why.not_enough`，移除 `attribution.*`。

## 验证
- 有城市 + 左侧说过话 → 右侧出现 2-3 条理由，每条都能指回原始来源。
- 清空 Profile 城市与对话 → 显示"再多说一句"引导，无编造文案。
- 点头像 → 资料页无任何 `In their words` 标签，隐藏字段不出现。
- 三个按钮（Say hello / Save / 看看别人）行为与位置完全不变。
