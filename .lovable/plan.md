
## 核心简化

Connections 就是一个「聊天列表」——像微信 / iMessage。不再分 incoming / sent / connected / faded 四段状态，全部合并成一列对话。右侧就是当前选中对话的聊天内容。

---

## 一、左侧：一列聊天

- 顶部标题：`Conversations` / 「对话」。
- 一段列表，按最近一条消息/事件时间倒序，不再分组。每一行统一结构：

  ```
  [头像·未读小点]   姓名                       12:30
                   最后一句话，截断一行灰色…
  ```

- 副标题「最后一句话」的取值规则（保持极简）：
  - 有消息：显示最新一条消息文本（不区分你/TA）。
  - 无消息但对方发来 hello（incoming）：显示对方那句 hello 引用。
  - 无消息但你发出 hello（sent）：显示你写的那句 + 尾部灰字「· 等待中」。
  - `faded`：整行 opacity-60，副标题显示「没有回音」。
- 未读点保留（`hasUnseenFor`）。右侧时间戳可选，本轮先不加，保持干净。
- 移除现有的 Section 分组、Archived 折叠按钮。`faded` 直接混在列表里靠 dim 表达；如果嫌乱后续再加长按/滑动归档，本轮不做。

## 二、右侧：始终展示聊天内容

无论对话处于什么状态，右侧都用**同一个聊天视图**，只是内容不同：

- **顶栏**：`[头像] 姓名 · 职业·城市 [⋯]` — 整块头像+姓名可点，直接打开 `PublicProfileSheet`（就地滑出，不跳走）。移除现有「← 返回介绍页」按钮。`⋯` 菜单收纳低频动作（撤回招呼 / 再打一次 / 移除 / 忽略），按当前状态显示对应项。
- **消息区**：
  - `connected` / `incoming` / `sent`：都用同一个消息流。对方那句 hello（`fromThem.reply`）作为消息流里 TA 发的第一条气泡；你那句 hello（`fromMe.reply`）作为你发的第一条气泡。之后正常追加 `messages`。这样用户看到的就是一条完整的聊天记录，不再有单独的「Hello Anchor 卡片」。
  - `sent` 状态：消息流里只有你那条气泡，底部一行灰字状态提示「等待回音…」，输入框禁用。
  - `incoming` 状态：消息流里只有 TA 那条气泡，底部提示「回复即建立联系」，输入框启用；发送即调用 `respondToIncoming`。
  - `faded` 状态：消息流展示当时留下的一两条气泡（置灰），底部提示「没有回音」，输入框禁用，主 CTA「再打一次招呼」。
- **底部输入框**：保持现有 Composer 样式；按状态启用/禁用。

移除 `HelloAnchor` 那两张引用卡片——信息已经融进消息流。

## 三、改动清单

1. `src/routes/connections.tsx`
   - 删除 Section / Archived 折叠。列表改成扁平一列，按 `Date.now`-ish 时间倒序。
   - `Row` 副标题按上文规则简化。

2. `src/components/canvas/connection-thread.tsx`
   - 顶栏：去掉返回按钮；头像+姓名可点开 `PublicProfileSheet`；右侧加 `⋯` 菜单。
   - 移除 `HelloAnchor`，把 `fromMe` / `fromThem` 转换成消息流第一条气泡再渲染。
   - 底部区域按状态切换：启用输入框 / 灰字状态 / faded CTA。
   - 让这个组件成为右侧唯一的 pane。

3. 删除或空壳化 `incoming-hello.tsx` / `sent-waiting.tsx` / `faded-pane.tsx`，全部合并进 `ConnectionThread`。`connections.tsx` 里不再判断 `paneKind`。

4. `src/locales/en/*.json` + `src/locales/zh-CN/*.json`
   - 新增：`connection.title_v2`（`Conversations` / `对话`）、`connection.waiting_tail`（`等待中`）、`connection.no_reply`（`没有回音`）、`connection.waiting_hint`（`等待回音…`）、`connection.incoming_hint`（`回复即建立联系`）、`connection.say_hello_again`（`再打一次招呼`）。
   - 保留但不再作为主副标题使用的旧 key 保留兼容。

## 四、不做

- 不改 `src/lib/connections.ts` 数据模型与状态机。
- 不改招呼、匹配、typing 模拟逻辑。
- 不引入 Cloud/后端。
