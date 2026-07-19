## 我的判断：你的方案更好，采纳

**逻辑：**

1. **城市属于"你是谁"，不属于"你此刻想干嘛"。** 它更接近姓名、年龄，是稳定的身份维度，天然归 Profile。放在 Profile 里做一次配置，全站受益（不仅 Do Something Together，将来任何跟人相关的功能都能复用）。

2. **单一数据源。** 之前把地点当作意图的一次性字段（`Intent.location` 自由文本），会出现"用户第一次写了里斯本，第二次忘了写就变全球"这种漂移。以 Profile 为默认值，就消除了这种"你以为系统记得、其实没记得"的落差。

3. **一次性覆盖满足差旅场景。** 你在里斯本常住，但下周出差东京，想在东京找人打球。此时输入"想在东京打网球"，本次心愿使用东京。Profile 不变，回国后自动回到里斯本。这是最贴近真实心智的模型。

4. **实现成本低、闭环紧。** `Profile.city` 早已存在且 `isVitalsComplete` 已在校验，只需把它变成进入 Do Something Together 的硬前置；再在意图解析里加城市识别；匹配引擎加一行城市过滤即可。不新增全局 Onboarding、不新增导航、不新增页眉入口。

---

## 设计方案

### 1. Profile 侧：城市从"应填"升为"必填"

- `src/components/profile-form.tsx` 的 Vitals 区块中，city 字段旁增加红点/星号 + 微文案"匹配时用来只看同城的人"。
- Profile 页读取 `?need=city` 时，在顶部横幅提示"再补一个城市就能开始匹配"，并把焦点滚到 city 输入框。

### 2. 进入 Do Something Together 前的硬前置

- `src/routes/side-by-side.tsx` 挂载时先校验 `loadProfile().city`。若为空：
  - 存 `sessionStorage["kindred:profile:return"] = "/side-by-side"`
  - 导航到 `/profile?need=city`
- 用户填完城市回来后（Profile 页返回按钮已支持 returnTo），继续原有流程。

### 3. 意图解析：文本里显式提到的城市 = 本次覆盖

- `src/lib/agents/side-by-side.ts` 增加 `findCity(text)`，用一份"已知种子城市"词典识别：里斯本/Lisbon、纽约/布鲁克林/New York/Brooklyn、柏林/Berlin、京都/Kyoto、墨西哥城/Mexico City、特拉维夫/Tel Aviv、哥本哈根/Copenhagen、拉各斯/Lagos、布宜诺斯艾利斯/Buenos Aires、爱丁堡/Edinburgh、温哥华/Vancouver、罗马/Rome。
- `submitPrompt` 优先级：文本解析城市 → Profile 默认城市。写入 `Intent.city`。

### 4. Intent 模型 + 匹配引擎

- `src/lib/intents.ts`：
  - `Intent` 增加 `city: string`（同时保留 `city_zh` 用于展示）。种子池按 `p.city / p.city_zh` 填充。
  - `publishMyIntent` 接受 `city` 参数（英文名统一存入 `city` 字段；本次不做中英文映射，比较用大小写不敏感的英文/中文任一命中即可）。
  - `findCandidatesTiered` 新增第一道硬过滤：`it.city === mine.city || it.city_zh === mine.city`（等值比较，忽略大小写/首尾空白）。exact / relaxed-when / relaxed-level 三档都在同城内进行，不做跨城 relax。
  - `findNearMisses` 同样按城市过滤。
- 移除旧的 `Intent.location` 自由文本字段的使用（保留字段但不再作为过滤依据；`EditWishPanel` 的地点输入改成"本次城市"）。

### 5. 匹配视图的城市标注

- `src/components/canvas/meet-canvas.tsx`：
  - `IntentCard` 顶部固定渲染 `📍 {城市}` 标签（我的卡 + TA 的卡都显示）。
  - 若本次 `Intent.city !== Profile.city`，我的卡的城市标签后追加"本次"小徽章，表示这是临时覆盖，让用户明确当前作用域。
  - `EditWishPanel` 里"地点"字段改名为"本次城市"，占位符提示"留空则回到默认城市 {profile.city}"。
  - `NoMatchView` 文案更真实："{城市} 暂时没人想{活动}。可以：换个时间/水平 · 换个城市（编辑心愿）· 稍后再看"。

### 6. 页眉城市小提示（轻量）

- Do Something Together 页面顶栏在 agent 名下方加一行极小的 mono 灰字："matching in {city}"，让用户随时知道当前作用域。点击不做任何跳转，避免和"编辑心愿"重复。

---

## 技术备忘

- **文件改动清单：**
  - `src/lib/intents.ts`：Intent 加 city 字段；publishMyIntent 接收 city；findCandidatesTiered/findNearMisses 加城市过滤。
  - `src/lib/agents/side-by-side.ts`：新增 findCity 词典解析；submitPrompt 注入城市；ParseResult 增加 city 可选字段。
  - `src/routes/side-by-side.tsx`：挂载前校验 profile.city，缺失则重定向到 `/profile?need=city`。
  - `src/routes/profile.tsx`：读 `?need=city`，展示引导横幅。
  - `src/components/profile-form.tsx`：city 字段加必填标记 + 微文案。
  - `src/components/canvas/meet-canvas.tsx`：IntentCard 城市标签；EditWishPanel 地点字段语义改为"本次城市"；页眉小行"matching in {city}"；NoMatchView 文案更新。
  - i18n：新增 `intent.matching_in`, `intent.this_wish_only`, `intent.edit_city`, `intent.edit_city_placeholder`, `intent.pool_no_city_body`, `profile.f.city_required_hint`, `hello.gate.need_city_banner` 等 key。

- **兼容性：** 已存在的 localStorage 里的旧 Intent 没有 city 字段。读取时若 city 为空，视作 Profile 当前城市（迁移策略：加载 my intents 时 lazy-fill）。种子池不需要迁移。

- **不做的事：**
  - 不做跨城 relaxed 匹配（不清晰，用户预期是"同城人"，跨城反而误导）。
  - 不做全局城市切换器 / 全局 Onboarding 弹窗（Profile 已经是唯一入口，避免双轨）。
  - 不改 `Intent.location`（自由地点文本）字段本身，只是不再依赖它做过滤——保留是为老状态兼容。
