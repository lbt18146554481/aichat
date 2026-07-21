# Introduce someone —— Action 结构与 Saved 抽屉重构

聚焦四件事，均为前端/呈现层调整，不动匹配算法与业务逻辑。

## 1. 三个 Action 并列（Say hello / Save / See someone else）

文件：`src/components/canvas/intro-canvas.tsx`（`!conn && !composing` 分支）

- 现状：`Say hello` + `Save` 双列网格，`See someone else` 作为下方弱链接；Save 会顺带调用 `onAnotherPerson()` 自动跳下一位。
- 改为：三个按钮同一行（`flex flex-wrap gap-2`），视觉层级：
  - `Say hello` — 主按钮（深底，`bg-foreground text-background`）
  - `Save` / `Saved ✓` — 次按钮（描边）
  - `See someone else` — 三级按钮（无边框 ghost 样式，`text-muted-foreground hover:text-foreground`）
- 三者语义正交、互不触发彼此。

## 2. Save 点击后仅切换按钮态，不再自动前进

同文件，Save 按钮 `onClick`：
- 去掉 `savePerson(...)` 之后的 `onAnotherPerson()` 调用
- 已 saved 再点 = `removeSavedPerson`（保持切换语义）
- 按钮文案/图标随 `saved` 切换（沿用现有 `BookmarkPlus` → `BookmarkCheck`、`connection.save` → `connection.saved`）
- 下方的 hint 文案保留一行（`connection.save_hint` / `connection.save_hint_saved`），告知用户可从顶栏「Saved」找回；不再有"自动跳到下一位"的隐性动作

用户想去下一位，明确点第三个按钮 `See someone else` 即可。

## 3. 移除"再试一次"重试提示（faded 状态）

同文件，`conn?.status === "faded"` 分支：
- 删除 `hello.faded_hint` 提示文案与 `intro.hello_again`（`undoFadedFor` + 重新 composing）按钮
- faded 态下只保留一个操作：`See someone else`（沿用 `intro.next_person_after` 或复用 `intro.see_someone_else` 文案，风格与非 conn 态对齐）
- 依据：现有"没成功，再写一次"的提示对用户无实际价值，且容易让用户误以为系统出错；对方没回应就是没回应，产品动作应向前（换一位），不向后（反复重写同一封）。
- `undoFadedFor` 导入若无其他使用点，一并清理 import。

i18n：`intro.hello_again` 与 `hello.faded_hint` 两个键**保留不删**（避免其他分支引用），仅停止使用。

## 4. Saved 抽屉改为 Tabs（People / Wishes）

文件：`src/components/saved-trigger.tsx`

- 现状：两个 section 竖向堆叠，`people` 与 `wishes` 都多时列表很长且视觉混乱。
- 改为 shadcn `Tabs`（项目已装，`@/components/ui/tabs`），两个 tab：
  - `People · N`（来自 Introduce someone）
  - `Wishes · N`（来自 Side by Side）
- 默认 tab 逻辑：
  - 两者都非空 → 默认 `People`（Introduce someone 是本轮重点）
  - 只有一边有 → 默认那一边
- 单边为空时该 tab 仍显示但内部呈现空态文案（复用 `saved.people_empty` / `saved.wishes_empty`，若缺则新增）
- 计数徽标沿用现有 `count = people + saved`
- 抽屉标题、副标题与打开逻辑不变；空态（`count === 0`）依然完全隐藏入口

## 技术要点

- 三个 action 直接用 `flex flex-wrap items-center gap-2` 一行；Say hello 按钮加 `flex-1 sm:flex-none` 让它在窄容器里优先占宽，Save 与 See someone else 自然并列
- Save 按钮点击不再触发 `onAnotherPerson`；`aria-pressed={saved}` 保留
- `matchmaker.tsx` 无需改动（`onAnotherPerson` 语义未变，Save 逻辑本就在 IntroCanvas 内闭合）
- Tabs 组件需要 `import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"`，把两段 `<section>` 分别塞进两个 `<TabsContent>`
- 新增 i18n（en / zh-CN）：
  - `saved.people_empty` = "Nothing saved yet from introductions." / "还没有从「介绍认识」里收藏任何人。"
  - `saved.wishes_empty` = "No wishes kept for later." / "还没有先收着的心愿。"

## 不做的事

- 不改 Sent / Connected 分支的按钮结构
- 不改 Save 存储结构，也不加分类/备注
- 不改匹配算法、passedIds 语义
- 不动 Side by Side 侧的 Saved 逻辑
