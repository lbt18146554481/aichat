
## 1. 首页 Introduce Someone / Do Something Together 芯片位置

**我的选择：移动到对话框内部（下方），并作为可选的"意图提示"，而不是硬性前置选择。**

### 判断逻辑

当前设计的两个问题：
- 桌面端芯片在输入框上方独立成行，视觉上像"必须先选 Agent"，与 Gemini/ChatGPT 的"自由输入 + 智能路由"心智不符。
- 移动端已经在输入框内部渲染了一次芯片，桌面端却在外部，两端不一致。
- 事实上 `routeIntent(body)` 已经能根据自然语言自动路由，芯片只是"覆盖"手段——它应当是隐性的辅助，而不是显性的门槛。

### 方案

- 统一把两个芯片放到输入框**内部左下角**（桌面 + 移动一致），与发送按钮同一行左右分布。
- 视觉上做成"轻量 pill"，默认未选中时是灰边淡文字，暗示"可选"。
- **不选直接输入时的处理**：走现有的 `routeIntent(body)` 自动路由：
  - 命中 "一起 / together / 约 / 找人" 等语义 → `sidebyside`
  - 命中 "介绍 / 推荐 / 认识" 等语义 → `matchmaker`
  - 都不命中 → 默认走 `matchmaker`（介绍某人是更"温和"的默认；同时在 `routeIntent` 里补齐若干中英文兜底关键词，减少误判）。
- 芯片仅在用户想"强制指定"时点亮，点亮后覆盖自动路由结果。

## 2. Profile 字段显示开关（极简方案）

不引入复杂的"可见性设置页"。采用**行内 eye 图标切换**：

- 在 `Profile` 数据结构里新增 `hidden: string[]`（存被隐藏的字段 key，例如 `["age", "gender", "orientation", "mbti"]`）。
- 只对**可选/敏感字段**提供开关：`avatar`、`age`、`gender`、`orientation`、`mbti`，以及每一条 `favorite` 和 `moment`。
- 必填的 `name` / `city` / `occupation` 不提供开关（它们是匹配硬过滤或身份基石）。
- UI：每个可切换字段右侧一个小 `Eye / EyeOff` 按钮，`EyeOff` 时该字段在他人可见的 `PublicProfileSheet` 中不渲染。
- `PublicProfileSheet` 读取时按 `hidden` 数组过滤。
- 顶部一句轻提示：`Toggle the eye to hide a field from others. / 点击眼睛图标可对他人隐藏该字段。`

这样零额外页面、零模式切换，用户在编辑时就能所见即所得。

## 3. Do Something Together 增加匹配成功案例

当前 `src/lib/people.ts` 的样本对 `sidebyside` 场景的命中率太低，导致大多数 wish 都落到 NoMatch 分支。修复思路：

- 在 `src/lib/people.ts` 中扩充 5–8 个"高命中率" seed 人物，覆盖常见活动：
  - 跑步 / 骑行 / 徒步 / 羽毛球 / 网球 / 咖啡 / 展览 / 桌游 / 电影
  - 每人绑定 2–3 个活动关键词 + 常见时间段（周末上午、工作日晚上）+ 常见城市（`Shanghai`、`Beijing`、`Shenzhen`、`Hangzhou`、`New York`、`San Francisco`）。
- 放宽 `matchIntent` 的匹配阈值：
  - 活动匹配采用"关键词包含 OR 同义词"（例：`run` ↔ `跑步` ↔ `jogging`）。
  - 时间"任一时段重叠即命中"，而不是全等。
  - 若城市在 seed 中缺省，则不作硬过滤（仅对 profile 城市做硬过滤）。
- 在样本中，为每位 seed 人物写好 `whyPerson` 摘要（"你说..." / "TA 说..."），让匹配卡不再回退到 fallback 文案。
- 在 `MeetCanvas` 空状态引导里，把示例改成用户可点击直接填入的"试试这句"：`Saturday morning run in Shanghai`、`Weekend badminton in Beijing`——点击即可预填输入框，一键复现成功流。

## 技术细节（供实现参考）

- `src/components/home.tsx`：删除桌面端外部芯片区块；把 `CHIPS` 渲染逻辑合并进输入框内部左下角；桌面/移动统一样式。
- `src/lib/route-intent.ts`：补齐中英文兜底关键词，明确默认走 `matchmaker`。
- `src/lib/profile.ts`：`Profile` 增加 `hidden: string[]`；`loadProfile` 兼容旧数据；导出 `isFieldHidden(p, key)`。
- `src/components/profile-form.tsx`：为可选字段和列表项加 `Eye/EyeOff` 切换按钮。
- `src/components/public-profile-sheet.tsx`：读取 `hidden` 并过滤字段。
- `src/lib/people.ts`：扩充 seed 数据；重写 `matchIntent` 的活动/时间比对逻辑。
- `src/components/canvas/meet-canvas.tsx`：空状态示例改为可点击预填 chip。
- `src/locales/*/common.json`：追加 `profile.visibility_hint`、示例 chip 文案等键。

## 确认点

如以上三条方向 OK，我将在切到 build 模式后一次性落地。若你希望**首页芯片继续保留在输入框上方**，或希望 Profile 字段开关做成**独立的可见性设置页**，请告诉我，我调整后再实施。
