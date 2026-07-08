
## 核心想法

**"发布"和"寻找"是同一个动作**：用户说一句"我想 X"，系统就把这句话放进意愿池 → 立刻在池里找双向兼容的人 → 有就直接开聊，没有就留在池里等（用户可以继续补充/改）。

**没有固定活动清单**：用户任意描述，系统从原话里抽出结构化字段（活动 + 时间 + 水平/其他修饰）。抽不出来的字段就是"任意"，不追问也能匹配；只有当"任意"太宽、池里 0 结果时，Agent 才会问一个最能收敛的问题。

**Agent 的作用**：解析 + 复述 + 兜底追问。不是引导表单，是"听懂了、我去看看"。

---

## 用户流程（就一条线）

```text
用户："周末想找人打网球，我新手"
  ↓
Agent 解析 → Intent{ kind:"tennis", when:"weekend", level:"beginner", rawText:"..." }
  ↓
右侧画布：立刻显示"你的心愿卡"（原话 + 抽到的标签），状态"在池子里"
  ↓
后台自动 match(myIntent) 
  ├─ 命中 → 心愿卡右边滑出"TA 的心愿卡"（对方原话 + 标签）→ 中间一行"都想 X · Y · 相当水平" → [开始聊天]
  │         点击 → 同一画布切成聊天视图，顶部保留双方原话横幅
  └─ 无命中 → 心愿卡下面显示"还没匹配到人。等等 / 换个说法 / 试试相近的" 
             + 相近意愿列表（同类活动但时间/水平错开的人）
             Agent 追问一句最有用的（比如时间没说就问时间）
```

用户随时可以在左侧输入新话，系统覆盖当前意愿或追加一个（多意愿并行）。

---

## 关键设计决策

**1. 解析用轻量规则 + 关键词**（demo 不接 LLM）
   - 活动词典：`tennis|网球`, `climb|攀岩`, `run|跑步`, `cook|做饭`, `exhibition|看展`, `bookstore|书店`, + 一些常见的额外词（`骑行`, `咖啡`, `徒步`... 匹配不上就归到"其他 / 原话"，池子里若有其他人也说了类似的原话也能匹配 —— 用简单的关键词重合度）
   - 时间：`周末|weekend`, `工作日晚上|weeknight`, `早上`, `晚上` → weekend/weeknight/any
   - 水平：`新手|beginner`, `进阶|中级|intermediate`, `资深|advanced` → 抽不到就是 any
   - **抽到什么算什么，没抽到就是 any，不追问**

**2. 匹配规则**（同一个函数处理 seed + user）
   - 已知活动类别之间：`kind === kind`
   - "其他" 活动之间：原话关键词重合 ≥ 2
   - 时间：`any` 匹配所有；否则相等匹配
   - 水平：`any` 匹配所有；否则差 ≤ 1 档

**3. 池子的透明度**
   - 用户的心愿卡永远显示在右侧最上方（原话 + 抽到的标签 + [撤回] [编辑]）
   - 让用户明白"我发布的就是这个，系统看到的是这些字段"
   - 匹配卡下方一行小字："基于你的『X』和 TA 的『Y』"，双方原话都能追溯

**4. Agent 追问的时机**
   - 只有一种情况追问：**池里 0 结果，且用户意愿有明显字段缺失可以放宽**（比如没说时间 → "你更倾向周末还是工作日晚上？说了我更容易帮你找"）
   - 追问一次就够，用户不答就保持"any"继续等

---

## 文件改动

**改**
- `src/lib/intents.ts` — 移除 `WhenTier`/`LevelTier` 的强类型枚举依赖，改为 `when?: string`, `level?: string`；`kind` 增加 `"other"` 类型；新增 `parseIntent(text): Partial<Intent>`；`findMatch` 支持"其他"分类的关键词重合匹配。
- `src/lib/agents/side-by-side.ts` — 状态机简化为 `collect | published | chat`（合并 match/nomatch 到 published，用 `matchIntentId` 是否有值区分）。删除 `submitPrompt` 的多轮追问、`answerSlot`、`resolveAmbiguity`、`chooseFromFallback`。核心动作只剩 `publish(text)`, `startChat()`, `revoke()`, `sendChatMessage()`。追问逻辑抽成 `nextClarifyingQuestion(state)`，只在 0 匹配时返回。
- `src/routes/side-by-side.tsx` — 大幅简化 `narrate()` 和 `handleChipClick`：Agent 只有三种消息（"我听到了 → 已发布"、"没匹配到，要不要补充 X"、"匹配到啦"）。
- `src/components/canvas/meet-canvas.tsx` — 顶部固定"你的心愿卡"，下方三态之一：（a）"TA 的心愿卡" + 对齐说明 + [开始聊天]；（b）0 匹配 + 近似列表；（c）聊天视图（顶部横幅保留双方原话）。
- `src/lib/types.ts` — `ActivityKind` 加 `"other"`。
- `src/locales/en/common.json` + `src/locales/zh-CN/common.json` — 移除"选活动"、"消歧义"、"fallback"相关文案，新增自由输入相关文案。

**保持**
- `PEOPLE` 种子数据不动，`seedPool()` 逻辑不动 —— 种子人的 intent 生成方式已经对齐"原话 + 结构化字段"模型。
- `/matchmaker`、`/connections`、首页不受影响。

---

## 验收

1. 首页输入"周末想找人打网球，我新手" → 进 Side by Side → 右侧立刻显示你的心愿卡（网球·周末·新手）+ TA 的心愿卡 + [开始聊天]，全程 Agent 只说一句"听到了，已发布"和"给你找到 TA 了"。
2. 输入"想找人一起骑车" → 系统抽出 kind=other, rawText="骑车" → 池里若无人匹配 → 显示"还没匹配到，要不要说说时间？"，用户不答也能停留在池里。
3. 心愿卡上的每个字段都可以在原话里指出来源；TA 的心愿卡内容能在 `PEOPLE` 或 `intents.ts` 的 seed 里找到。
4. 匹配成功后点 [开始聊天] 停留在同一页面，聊天视图顶部保留双方原话横幅。
5. 全程无跳转到 `/connections`，无"等待回应"中间态。
6. `tsgo --noEmit` 通过。
