## 我的独立判断：**你的方案更好**

我上一版另起炉灶做"Do Sth Together 专属的 onboarding 卡片"，是错的。原因：

1. **数据早就有了**。`src/lib/profile.ts` 里 `Profile.city` 是 L1 vitals 字段，`isVitalsComplete` 已经把 city 当成必填校验的一部分。我再造一个 `user-profile.ts` 就是重复轮子。
2. **城市是"你是谁"，不是"你想做什么"**。放在 Profile 才是正确归属，Do Sth Together 只是**读者**。
3. **允许覆盖（"想去东京打网球"）** 让方案能兼顾常驻 + 出差/旅行场景，代价接近零——解析器加一个词表就够。

所以采纳你的方案。下面是把它落到最简的具体设计。

## 最终设计

### 1. Profile：city 是硬门槛

Profile 里 city 现在就在必填校验里，只是**没被强制**——用户可以跳过 Profile 直接进 Do Sth Together。改成：

- 首次进入 Do Sth Together 时，如果 `profile.city` 为空 → 路由拦截跳到 `/profile`，顶部加一条明确提示："先告诉我你在哪座城市，Do Sth Together 只帮你找同城的人。"
- Profile 页里 city 字段加红点/必填标记，跳到 Do Sth Together 的返回按钮在填完 city 后才亮起。
- Matchmaker 板块不做这个拦截（跨城异地相亲合理）。

### 2. 匹配默认用 profile.city

许愿文本里没提城市 → 池子按 `profile.city` 硬过滤。

### 3. 许愿里可覆盖：一次性

用户输入 "想周末在东京打网球" → 解析出 `city: 'tokyo'` → 本次心愿用东京做过滤，**不改 Profile**。

- 在 `parseIntent` 里加一个 `findCity(text)` 词表：种子池里出现过的城市中英双语（Lisbon/里斯本、Tokyo/东京、NYC/纽约、Berlin/柏林……只识别有候选人的城市，避免解析出无人城市）。
- `Intent` 新增 `city: string`（必填，缺省 = `profile.city`）。
- 卡片顶部显示 `📍 Tokyo (this wish only)` / `📍 东京（本次）`，与 profile 城市不同时高亮一下，让用户看到自己被理解了。
- 编辑心愿面板里把 location 字段升级为城市下拉/输入，可改。

### 4. 空池：诚实

`profile.city = Lisbon` 的用户想打网球，但里斯本没网球候选人 → 卡片显示：

> Lisbon 暂时没有人想打网球。  
> [收藏这个心愿] · [看看其他城市的人（不同城）]

次要按钮"看看其他城市的人"临时放开城市过滤（继续走已有的 exact/relaxed 分档），但顶部标签明确写 **CROSS-CITY / 不同城**，让用户知道见不了面。

### 5. 页眉不需要城市芯片

因为 city 在 Profile 页可改，Profile 入口已经在页眉。不加重复入口。

## 用户旅程

```text
首次打开 Do Sth Together
  → 检测 profile.city 空
  → 路由跳 /profile + 顶部提示条
  → 用户填 Lisbon，回到 Do Sth Together

许愿："想周末打网球"
  → 池 = Lisbon + 网球 + 周末 → 找到 Isa

许愿："想去东京打网球"
  → 解析 city=Tokyo（覆盖）
  → 池 = Tokyo + 网球 → 找到 June
  → 卡片提示"本次心愿"，profile 不变

搬家：/profile 改 city → 下一次许愿自动跟随
```

## 为什么这是最简

- **零新表**：复用 `profile.city`。
- **零新 UI 组件**：Profile 页 + 拦截提示条 + 卡片顶部一个 city 标签，都在既有骨架里。
- **一句话规则**：**"心愿里说了就听心愿，没说就按 Profile。"** ——用户和开发都好记。
- **默认无需思考**：99% 时间用户不用输入城市，就是同城匹配。

## 需要你拍板一件事

**空池时，"看看其他城市的人"次要入口要不要保留？**

- 保留：demo 更少空状态，但引入"匹到不能见面的人"的可能。
- 去掉：更纯粹诚实——"同城没人 = 收藏等人加入 / 换个活动"两条路。

我倾向**去掉**，因为你反复强调的就是"没有地点、跨全球没意义"。加了这个逃生舱等于在自相矛盾。

## 技术改动清单（等你确认后再动手）

- `src/lib/intents.ts`：`Intent` 加 `city: string`；`findCandidatesTiered` 在最外层按 city 过滤。
- `src/lib/agents/side-by-side.ts`：`parseIntent` 加 `findCity(text)`；`publishMyIntent` 若解析无 city 则用 `profile.city`。
- `src/routes/side-by-side.tsx`：`beforeLoad` / mount 里检查 city 空则 `redirect('/profile?need=city')`。
- `src/routes/profile.tsx` + `src/components/profile-form.tsx`：city 加必填标记；根据 `?need=city` 显示提示条。
- `src/components/canvas/meet-canvas.tsx`：卡片顶部渲染 `📍 city`；覆盖情况加"本次"标签；空池文案；去掉旧 `location` 显示（或降级为"具体区域备注"）。
- `EditWishPanel`：`location` 输入改成城市（可选，只影响本次）。
- i18n：约 6-8 条键。
- 种子人物已有 `city` / `city_zh`，无数据改动。