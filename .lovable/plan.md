
# Introduce Someone —— Action 逻辑修复与流程闭环

围绕三件事：（1）Action 行为语义纠错；（2）系统不再回头推荐没成功的人；（3）Say hello / Save 的前后路径都留出可见的出路。全部为前端 + 匹配过滤层调整，不改 Connections/Sessions 存储结构。

## 1. 匹配池：过滤掉"没成功的人"

文件：`src/lib/agents/matchmaker.ts`

现状问题：`pickNext` 只看 `passedIds` 和 `shownIds`。一旦某人的 hello 变成 `faded`（对方没回应），Ta 仍会因为 `shownIds` 已含被扣 5 分，但当"新鲜池"用尽后 fallback 会把 faded 过的人再翻出来。用户视角：明明"没成功"的人又被推回来，很怪。

改动：
- 引入 `hasFadedWith`（已存在于 `src/lib/connections.ts`）作为**硬过滤**
- `pickNext` 中：
  - 计算 `fadedIds = PEOPLE.filter(p => hasFadedWith(p.id)).map(p => p.id)`（只在浏览器端有效；SSR/无 window 返回空集）
  - `fresh` 与 fallback `pool` 都追加 `!fadedIds.includes(p.id)` 条件
  - 已 `connected` / `sent` 的人也一并排除（Ta 已经在正在进行的连接里，不应再作为"新推荐"出现）
- 池彻底空时仍走 `L.none_left` 文案，不做兜底把 faded 人塞回

结果：faded 的人**永远不再被推荐**，用户也不再看到"再试一次"这种回环入口（第 3 节配合）。

## 2. Action 语义修正（`src/components/canvas/intro-canvas.tsx`）

现有几个隐性 bug：

**Bug A —— `sent` / `connected` 状态下的"下一位"错误地把当前人写进 passedIds**  
现状：`onAnotherPerson` 一律调用 `actAnotherPerson` → `passedIds.push(currentPersonId)`。但此时用户**刚给 Ta 发了 hello / 已经在聊了**，把 Ta 标记为"已 pass"是错的语义——只是"看下一位"而非"放弃这位"。

改动：`matchmaker.tsx` 提供一个新的动作 `onSeeNextPerson`（不 pass，直接换下一位）。
- `matchmaker.ts` 新增 `seeNextPerson(state, lang)`：与 `actAnotherPerson` 类似，但**不把 currentPersonId 加入 passedIds**，直接 `introduce(state, lang)`。
- `matchmaker.tsx` 把 `IntroCanvas` 的 `onAnotherPerson` 拆成两个 props：
  - `onPassAndNext`：仍写 passedIds（`!conn && !composing` 分支的 "See someone else" 使用）
  - `onSeeNextPerson`：不写 passedIds（`sent` / `connected` / `faded` 分支使用）

**Bug B —— Say hello 禁用态没有出路**  
`moments.length === 0` 时按钮直接 disabled，用户既不能打招呼也拿不到提示。这些人是"没有 moments、只有 portrait"的资料。

改动：
- 当 `moments.length === 0` 时，**不禁用** Say hello，改为允许发一句无引用的 hello（`quotedMomentId = null`，`HelloComposer` 本身已支持 null）
- 若因 profile 不完整需要回填，走已有的 `/profile` 跳转分支（不变）

**Bug C —— Save 的可见性规则**  
现状：`saved` 状态只在 `!conn && !composing` 分支显示按钮。用户在 `composing`（写 hello 中途）时，中途反悔想"先收着再说"，没有入口。

改动：`composing` 分支的 `HelloComposer` 上方增加一小行右对齐的 "Save & write later"（次要 ghost 按钮），点击 = 保存 + 取消 composer + 关闭 draft。文案键：`connection.save_and_later`。

## 3. 前后路径闭环

**Say hello 之前 —— composing 态的回退**  
`HelloComposer` 已有 `onCancel`。补一条 UI 明示：composer 顶部加一行 crumb `← {t("intro.back_to_actions")}`（点击 = Cancel）。避免用户在 composer 里以为"只能发出去或强关页面"。

**Say hello 之后 —— sent 态**  
现状按钮：`Next person` + `Check progress`。修复：
- `Next person` 改用 `onSeeNextPerson`（不 pass 当前人）
- `Check progress` 保留
- hint 文案 `intro.after_hello_hint` 中显式点出："如果 Ta 没有回应，这次会静静地过去（fades），我们不会再把 Ta 推给你" —— 让"faded = 永久不复现"变成用户可感知的合同。新增 i18n 键或改写现有键。

**Connected 态**  
- 主按钮 `Open conversation` 保留
- 次按钮 `while_you_chat` 改用 `onSeeNextPerson`（不 pass）
- 保留 `connection.connected_note`

**Faded 态（保底，正常情况下不会出现，因为下一位不再是 Ta）**  
如果用户直接回到 URL 打开一个已 faded 的人（例如从 Saved 打开），显示极简说明 + 一个按钮：`See someone else`（用 `onSeeNextPerson`）。删除任何"再试一次 / hello_again"痕迹（上一轮已做，本轮确认）。

**Save 之后的下一步提示**  
现状 `save_hint_saved` 只说"可以在 Saved 里找回"。补足**下一步动作提示**：
- 已 saved 时，hint 文案改为两行：一行说明"Ta 已放进 Saved（顶栏可找回）"；一行 CTA `See someone else →`（可点击文字链接，触发 `onPassAndNext`）
- 明确"Save 不会自动前进，但你可以现在就看下一位"这层意图

## 4. i18n 新增/改写（`src/locales/{en,zh-CN}/common.json`）

- `connection.save_and_later`：`Save & finish later` / `先收着，之后再写`
- `intro.back_to_actions`：`← Back` / `← 返回`
- `intro.after_hello_hint`（改写）：加一句"如果 Ta 没回应，这次会自然过去，我们不会再把 Ta 推给你。" / "如果 Ta 没有回应，这次就静静过去，我们不会再把 Ta 推回来。"
- `connection.save_hint_saved`（改写）：拆成主提示 + `see_someone_else` 单独作为链接文案（复用已有键）

## 5. 不做的事

- 不改 `Connection` / `Session` / `SavedPerson` 存储结构
- 不改评分权重（`scorePerson` 内部逻辑不动）
- 不改 Say hello 的写作流程（Composer 组件内部不动）
- 不改 Saved 抽屉 Tabs 结构（上一轮成果保留）
- 不动 Side by Side / Connections 页面

## 技术要点摘要

- `matchmaker.ts`：新增 `seeNextPerson`；`pickNext` 加入 `hasFadedWith` + `sent/connected` 硬过滤；SSR 安全（`typeof window` 判空）
- `matchmaker.tsx`：`IntroCanvas` 的 props 从单一 `onAnotherPerson` 拆为 `onPassAndNext` + `onSeeNextPerson`
- `intro-canvas.tsx`：Say hello 去掉 disabled；composing 内加 back crumb 与 Save-later 快捷；sent/connected 用 `onSeeNextPerson`；saved hint 补 CTA
- 类型：`Props` 更新，`onPass?` 旧兼容 prop 一并移除（无外部引用）
