## 目标
把两个被混淆的流程彻底拆开，并建立不可被局部改动破坏的产品规则：

```text
寻找对象 → Agent 信息足够 → 推荐有真实依据的人 → 查看结果 → Say hello
                                                ├─ 首次/资料未完成 → 补全 Profile → 原人原会话原操作
                                                └─ 资料已完成 → 直接写招呼

普通 Agent 对话 → 只有当前任务确实缺少信息时 → 聊天内临时 Ask
```

## 已确认的当前问题
- 结果页在 `buildReasons()` 返回空数组时直接显示 `why.not_enough`，所以已经推荐了人却又让用户回左侧补充，产品逻辑自相矛盾（`intro-canvas.tsx:272-275, 582-585`）。
- 当前理由主要依靠用户原话和候选人回答的字面词重合；Demo 数据没有保证每位候选人的爱好、价值观、书影音能与请求形成可展示证据，因此空态可稳定出现（`match-reasons.ts:85-148`）。
- Say hello 目前只检查姓名，并优先触发左侧一次性 Ask，而不是首次用户的完整 Profile 补全（`intro-canvas.tsx:218-237`、`matchmaker.tsx:103-179`）。
- 注册完成当前立即跳 Profile，而不是允许用户先看到匹配、在 Say hello 这个有明确动机的节点补资料（`auth.tsx:81-89`）。
- Profile 表单内部即时保存，但 Profile 路由的进度只在初次加载和窗口 focus 时更新；父页面不能可靠感知用户刚刚填完，因此“填完自动回原会话”不可靠（`profile-form.tsx:70-78`、`profile.tsx:40-71`）。

## 实施方案

### 1. 重建“为什么是 TA”的数据规则
- 将“匹配理由”定义为推荐前置条件，而不是结果页的事后补丁。
- 理由只允许来自三类真实 Profile 数据：
  1. **爱好/生活方式**：用户当前对 Agent 说的目标，与候选人的 Moment 原文对应；
  2. **价值观**：用户目标与候选人的 values Moment 原文对应；
  3. **书影音/收藏**：双方共同 Favorite，或用户明确提到的作品/类别与候选人 Favorite 对应。
- 为 Demo 候选数据建立明确的“信号 → 证据引用”映射，引用必须指向现有 Moment ID 或 Favorite，绝不再用 `portrait`、`angles`、`personBrief` 等系统编写的介绍作为证据。
- `buildReasons()` 返回结构化理由：匹配目标、类别、候选人原文/作品、来源 ID；候选排序直接使用这些理由。
- 修正中英文归一化，但不再把“碰巧共享一个普通词”视为充分理由。

### 2. 建立推荐不变量，删除错误结果空态
- `pickNext()` 只允许展示至少有一条可追溯理由的候选人。
- 如果当前信息不足以产生任何有依据的候选人，Agent 在**推荐之前**继续问一个具体问题；右侧保持未出结果状态。
- 一旦右侧出现候选人，就一定展示 1–3 条简洁依据，不再出现 “Nothing solid to point at yet…” 或任何“结果出来后再补一句”的提示。
- 右侧结构固定为：
  - 头像、姓名、年龄、职业、城市；
  - `Why this match`：按“共同爱好 / 价值观 / 书影音”展示真实引用；
  - Say hello / Save / See someone else，按钮行为保持不变。
- 如果同一 Moment 已经作为匹配依据引用，下面不重复展示；公开资料页仍只展示对方选择公开的原始资料。

### 3. 补齐可工作的 Demo
- 为首屏常见请求准备确定性 Demo 覆盖：安静/善良、读书、艺术、音乐、户外、做饭、好奇/诚实等。
- 每个 Demo 请求必须命中一个候选人，并至少显示一条与请求相关、可点击追溯到公开 Profile 的证据。
- Favorite 不做伪造的“共同点”：只有双方确实填写同一作品或用户明确提到时才显示共同收藏；否则作为公开资料内容，不冒充匹配理由。

### 4. 恢复首次用户在 Say hello 时补 Profile
- 注册成功后不再强制立即进入 Profile；返回原本目的地，让用户先完成寻找并看到结果。
- 点击 Say hello 时：
  - 若 `isProfileComplete()` 为 false，保存精确返回地址、session ID、person ID、右侧滚动位置与 Hello 草稿，进入 Profile onboarding；
  - 若资料完整，直接进入 Hello composer；
  - 不再把姓名/城市缺失错误地交给一次性 Agent Ask。
- Profile onboarding 只要求当前已经定义的完整门槛：Vitals、至少 3 个 Moments、至少 1 个完整 Favorite；页面明确显示剩余项。
- ProfileForm 向 Profile 路由实时回报最新 Profile/进度；保存完成后自动返回原 `/matchmaker?session=…`。
- 返回后恢复同一候选人、同一结果、滚动位置和草稿，并自动重新打开 Hello composer；不会创建新 session、换人或丢失左侧对话。

### 5. 将普通 Agent Ask 与 Profile onboarding 完全隔离
- 删除 Introduce Someone 中“缺姓名 → 一次性身份 Ask”的 `onNeedProfile / oneShotIdentity` 专用链路。
- 保留通用 `AgentAsk` 组件，但只用于当前对话任务确实缺少的信息，例如 Do Something Together 在发布心愿前缺时间/水平，或 Agent 需要用户确认一项临时选择。
- 普通已初始化用户进入页面、看到结果或点击头像时都不自动触发 Ask；只有执行到具体缺失步骤时才出现。
- Ask 的回答继续只服务本次动作，不回写 Profile，也不与首次资料补全混用。

## 验收与回归测试

### 匹配结果
- 英文与中文各跑一组：安静善良、读书、艺术、音乐、户外、做饭、诚实。
- 断言每组：结果出现、至少一条真实理由、引用与候选公开资料一致、页面不存在 `why.not_enough` 文案。
- 输入确实无法判断的模糊句子时：只在左侧继续澄清，右侧不得先展示候选人。
- Save、See someone else、头像资料页、Say hello 按钮行为不回归。

### 首次用户闭环
1. 清空 auth/profile/session 数据后走邀请注册；
2. 注册后不被提前强制 Profile；
3. 创建 Introduce session 并看到有依据的候选人；
4. 点击 Say hello 才进入 Profile；
5. 补全后自动回到完全相同的 session 和候选人；
6. Hello composer 自动恢复，草稿与滚动位置仍在；
7. 刷新页面后 session 与候选人仍正确。

### 已初始化用户与临时 Ask
- 完整 Profile 用户点击 Say hello 直接进入 composer，不经过 Profile、不出现身份 Ask。
- 普通进入 Introduce 结果页不自动出现 Ask。
- Do Something Together 只有在发布动作缺少必需时间/水平/城市时才出现对应临时 Ask，取消后不污染 Profile。

### 设备
- Playwright 在 1280px 桌面与 iPhone 刘海尺寸各跑一次完整流程，检查返回、Safe Area、滚动恢复、Ask 卡片与输入区不遮挡。
- 最后执行类型检查、lint，并用浏览器 DOM/截图确认真实文案和状态，而不是只验证代码编译。