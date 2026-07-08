
# Side by Side 再设计：双向意愿匹配 Agent

## 我理解的问题

你上一次说的三件事，之前那版没做到：

1. **"这本身是一个 match，双方都想就自动 match"** —— 现在的实现是单方在浏览一个静态人物池，感觉像刷候选人，不是"双方都想做这件事，所以我把你们对上"。
2. **"之前会追问时间、水平之类的条件，现在什么也没有"** —— 追问逻辑其实还在（`askedCount ≤ 1` + 池 > 3 才问），但阈值太严、大多数输入直接跳到候选卡，用户感觉不到 Agent 在"帮我筛"。
3. **"没有 match 的人时，产品的流程"** —— 现在无匹配只有一句"没人"+ near-miss chip，没有闭环。

## Agent 的定位（一句话）

**Side by Side = 双向意愿撮合。你说一件想一起做的事，我在"也想做这件事"的人里帮你挑一个；两边都想，才叫 match。**

和 Matchmaker 的区别：Matchmaker 是"介绍一个人"（基于人物画像），Side by Side 是"撮合一件事"（基于当下的意愿）。

## 新流程（起 / 中 / 结束）

### 起
进入 `/side-by-side`：左侧对话，右侧空态画布（图 + "说一件想一起做的事，我在也想做这件事的人里挑一个"）。Agent 第一条消息：
> "想和谁一起做点什么？说一句就行——我在'也在等这件事'的人里帮你挑。"

### 中（全部在同一个对话窗口里）

1. **用户说一句** → Agent 复述听到的（"听到了：网球 · 周末"），让用户随时能校准。

2. **Agent 决定要不要追问**（关键改动，比现在更主动）：
   - 候选池 ≥ 2 人 且缺 `when` → 追问时间（chip：周末 / 工作日晚上 / 都行）。
   - 候选池 ≥ 2 人 且是运动类（tennis/climb/run）且缺 `level` → 追问水平（chip：新手 / 一般 / 进阶 / 都行）。
   - 上限从 1 提到 **2**：时间和水平可以分别问一次，但每一步都必须"仍然有帮助"（问完前后候选池会变小才问，否则跳过）。
   - 歧义（L2）和兜底（L3）不占额度。

3. **匹配呈现**（右侧画布，强调"双向"）：
   - **有匹配** → 候选卡顶部加一行绿色徽标："TA 也在等 · 周六上午 · 网球"，下面是画像/venue/理由，按钮"打个招呼"和"换一个"。这条徽标是核心情绪价值——让用户看到"这不是我在追人，是我们都在等"。
   - **对话消息** → "找到了。TA 周六上午也在等一起打网球的人，常在 XX 场。"

4. **无匹配 —— 完整闭环**（这是这次重点补的）：
   - **加入等待名单**：右侧画布出一张"等待卡"，写清"我先把'你想周六打网球'记下来，一有人也说想做这件事，我通知你。" 卡片按钮"加入等待"（本地持久化到 `waitlist`），加入后卡片变成"已加入 · 你在等 3 件事"。这条消息也进对话流。
   - **near-miss**：如果同一个 kind 有人但时间对不上，对话里追加一条："另有 2 人也想打网球，但他们在周日下午。要看看吗？"chip 直接切到那个时间。
   - **换个说法**：对话里给出"也可以试试" 的横向建议 chip（相邻 kind：网球 → 跑步 / 攀岩），点了等价于新一句 prompt。
   - **池尽**（连 near-miss 都空）：对话说"这一轮我没找到能对上的人。你在等的事我记下来了。" 不再逼用户重来。

### 结束
- 点右侧候选卡"打个招呼" → 写 connection + opener，跳 `/connections`。唯一"完成"信号，不变。
- 点"换一个" → 右侧刷新，对话追加"再看一个 · 周六上午 网球"。
- 池尽或加入等待 → 输入框重新聚焦，Agent 说"再说一件呗？"

## 关键设计判断

- **"TA 也在等"徽标**是这次的情绪核心——它让 side-by-side 和普通推荐拉开差距。**技术上先用规则模拟双向**：一个 person 在数据里有 `activity + slot`，就视为 TA "在等" 一个和你 kind/when 对齐的搭子。真正的双向队列（两个真实用户互相匹配）留到后端，视觉先到位。
- **等待名单**是本地 `waitlist`（`localStorage`），存 `{ kind, when, level, addedAt }`。首次加入时给一个轻的确认反馈。以后同样的意图再次输入且仍无匹配时，Agent 会说"你之前也在等这件事——先给你换个近似时间试试？"
- **追问 chip 上限从 1 → 2**（分别为时间/水平，最多各一次），但**每次追问前先算一遍"问完是否会缩小候选池"**，无益则跳过。这直接回应"之前会追问"的诉求。
- **near-miss + 相邻 kind 建议**必须同时出现在无匹配时，不能只出一个。
- 视觉/布局延续 Matchmaker 的 Workspace（左对话右画布），不改。

## 技术改动

**`src/lib/agents/side-by-side.ts`**
- `SideState` 增加 `waitlistIds: string[]`（当前意图的哈希，用于知道用户已经登记过什么）。
- 新增 `WaitEntry = { id, kind, when?, level?, addedAt }`，通过 `waitlist-utils` 存在 `localStorage`（新文件 `src/lib/waitlist.ts`）。
- `decide()` 里追问阈值：`ASK_THRESHOLD` 从 3 降到 2；新增"如果强制追问后 pool 不会变化则跳过"检查（对每个可能答案模拟一遍 `poolSize`）。
- `askedCount` 上限从 1 提到 2，且允许一次问 when、一次问 level。
- 新增 `addToWaitlist(state)` action：把当前 intent 存 waitlist、追加确认消息。
- 候选卡数据里加 `mutual: true`（视觉徽标用），当前静态数据下永远 true——保持契约干净。
- 无匹配分支返回值加 `suggestKinds: ActivityKind[]`（相邻 kind 建议，规则：同类活动组内其它 kind）。

**`src/components/canvas/meet-canvas.tsx`**
- `CandidateView` 顶部加"TA 也在等"徽标（绿色小 pill + 时间摘要）。
- `NearMissView` 拆成两半：上半"加入等待"卡（按钮 + 说明），下半 near-miss 列表；池尽时只显示"已记下"确认卡。
- `EmptyCanvas` 文案调成"说一件想一起做的事——两边都想才算 match"。

**`src/routes/side-by-side.tsx`**
- `narrate()` 增加两类消息：`meet.found_mutual`（有匹配时的"TA 也在等"复述）、`meet.no_match_waitlist`（无匹配 + 已经/未加入 waitlist 分两种文案）。
- 新增 `handleJoinWaitlist()` → 调 `addToWaitlist`。
- Chip actions 增加 `add_to_waitlist` 与 `suggest_kind`（后者复用 `chooseFromFallback`）。
- 输入框 placeholder 复用 `chat.placeholder_first`。

**`src/lib/waitlist.ts`**（新）
- `loadWaitlist()` / `saveWaitlist()` / `addEntry()` / `hasEntry(intent)` 四个纯函数，localStorage key `kindred:sidebyside.waitlist.v1`。SSR 安全。

**locales（`src/locales/{en,zh-CN}/common.json`）**
- 新增：`meet.mutual_badge`（"TA 也在等"）、`meet.found_mutual`、`meet.waitlist_offer`、`meet.waitlist_joined`、`meet.waitlist_recall`、`meet.suggest_kinds_intro`、`meet.no_match_waitlist`、`meet.empty_title`/`empty_hint` 换新文案。
- 删除：现在的 `meet.retry_hint` 里已用不到的兜底口吻。

## 验收

1. 输入"想打网球" → Agent 追问时间；再追问水平；然后出候选卡，顶部有"TA 也在等 · 周六上午 · 网球"徽标。
2. 输入"周六上午想打网球，进阶" → 直接出候选卡（跳过追问，因为信息够 & pool ≤ 2 or 追问无收益）。
3. 无匹配（例如构造一个池里没人的组合） → 对话给出"加入等待"提示 + near-miss chip + 相邻 kind chip；右侧出等待卡；点"加入等待"后卡片变"已加入"并追加确认消息。
4. 已经在 waitlist 的意图再次输入且仍无匹配 → Agent 说"你之前也在等这件事，先看看这个时间的近似人？"
5. `/matchmaker` 完全不受影响。
6. `tsgo --noEmit` 通过。

## 为什么这样对

- **回到"双向"的产品叙事**：候选卡上的"TA 也在等"徽标是最短、最诚实的双向表达；不需要真的实现队列匹配就能让用户读到这层意思。
- **追问变得"看得见"**：从最多 1 次提到最多 2 次（when + level），阈值从 3 降到 2，用户会明显感觉到 Agent 在帮忙筛。同时保留"问完无收益就跳过"，不会变啰嗦。
- **无匹配有完整闭环**：加入等待 + near-miss + 相邻 kind 三件套，用户永远不会走到"没了，再说一句"的死路上。
- 保留上一版的对话形态、L1/L2/L3 解析、否定、截断——这次只在意愿层和无匹配层加东西。
