
# Profile 重构：三层结构，各司其职

## 一、想清楚的结论（作为设计前提）

**Profile 的作用**：降低"要不要花时间在 TA 身上"的判断成本。它有两个读者——系统 & 另一个真人——各读各的部分。用户不为"吸引"而写，只为"诚实"而写。

**内容的逻辑线**（对齐"先做朋友"的渐进定位）：

| 层 | 读者 | 解决的问题 | 具体字段 |
|---|---|---|---|
| **L1 · Vitals** | 系统硬筛 | 地理/年龄段是否可能共处 | 名字、年龄、城市、职业 |
| **L2 · Compatibility** | 系统排序 + 另一半的参考 | 长期相处的兼容性信号 | 3 道情境选择题 + 常做的活动 + MBTI（可选标签） |
| **L3 · Specificity** | 另一个真人 | 触发"想对 TA 说一句话"的冲动 | Moments（≥3）+ One Work |

**为什么不问婚史/生育**：定位是"先做朋友"，硬约束会劝退，也和产品气质冲突。这些真需要时可以在 L2 的情境题里以温和方式覆盖（比如"未来 5 年最想投入的事"）。

**为什么 MBTI 只做标签不做排序**：学术信效度不够，但用户熟悉、愿意填、是自我表达词汇。放 L3 作为可选 tag，让人读时当作破冰点，不进匹配算法。

**为什么 activities 放 profile 而非 Side by Side 现场问**：用户填 profile 时是"平静地想清楚自己"的状态；进入 Side by Side 时是"想找人"的状态，被追问会烦。且 activities 是 Side by Side 的燃料，profile 是唯一稳定源头。

## 二、当前 profile.ts 的差距

- ✅ 已有：name / age / city / occupation / moments / oneWork
- ❌ 缺 L2 全部：情境题、activities、MBTI
- ⚠️ UI 上 L1 和 L3 混在一张长表单里，用户感受不到"哪段给谁看"

## 三、要做的改动

### 1. 数据模型 (`src/lib/profile.ts`)

```ts
export interface CompatibilityAnswers {
  weekend?: "quiet_recharge" | "one_close_friend" | "out_and_about";
  conflict?: "talk_now" | "cool_off_first" | "write_it_out";
  five_years?: "depth_one_thing" | "range_many_things" | "stability_family";
  // 3 道题，可选，全部允许空
}

export interface UserActivity {
  kind: ActivityKind;      // 复用 types.ts 的 ActivityKind
  area: string;            // 用户手填街区/区
  cadence: "weekly" | "monthly" | "occasional";
}

export interface Profile {
  // 现有
  name; age; city; occupation; moments; oneWork;
  // 新增
  activities: UserActivity[];   // 0-3 项
  compatibility: CompatibilityAnswers;
  mbti?: string;                // 可选，仅作为 tag
}
```

`isProfileComplete` 语义不变（仍以 vitals + 3 moments + oneWork 为准）；L2 字段全部可选，不影响任何"完整度"判定——保持"先做朋友"的低门槛。

### 2. 表单结构 (`src/components/profile-form.tsx`)

分三个视觉段落，每段一句 helper 说明"这段是给谁看的"：

```text
┌ 基本信息 (Vitals) ────────────────────────
│  helper: "系统用来判断你们是否在同一个城市。"
│  [name] [age] [city] [occupation]

┌ 你怎么生活 (Compatibility)  可选 ─────────
│  helper: "系统用来把更可能合得来的人排在前面。填不填都可以。"
│  · 3 道情境二/三选题（radio card 形式，不是下拉）
│  · 常做的活动：+ 按钮加 1-3 项，每项 (kind, area, cadence)
│  · MBTI 输入：可选，一行小字"仅作为标签展示，不参与匹配"

┌ 你的瞬间 (Specificity) ───────────────────
│  helper: "别人会通过这些认识你。用你自己的话写。"
│  · Moments 编辑器（现状）
│  · One Work（现状）
```

所有字段沿用现有的"输入即保存"机制。三段之间用大间距分开，不用 tab、不用折叠——一屏顺序读下去。

### 3. 匹配器接入（后续，非本轮 UI 改动）

在 `matchmaker.ts` 的 `scorePerson` 里，把 `profile.compatibility` 和 `profile.activities` 纳入软信号（Side by Side 已经用 activities，Matchmaker 补上兼容性题的加权）。本轮先落 UI 和数据模型；匹配逻辑接入拆到下一轮，避免一次改太多。

### 4. i18n

新增 keys：三段的 heading、helper、3 道情境题的题干和选项、activity 表单的 cadence 词汇、MBTI 提示。中英各一份。

## 四、明确不做的

- 不加婚史、生育、宗教、收入
- 不做 MBTI 排序算法
- 不做 activities 的时间段/技术水平细化（复用 UserActivity 三个字段够 Side by Side 撮合初版）
- 不动 Matchmaker/Side by Side 的匹配逻辑（下一轮）
- 不改 Say hello / IntroCanvas 相关代码

## 五、验收

1. 打开 `/profile`，看到三段清晰分隔，各自有一句 helper 说明用途。
2. 只填 vitals + 3 moments + one work 仍算完成（保持低门槛）。
3. L2 任何字段可留空、可随时补；填了即保存。
4. `loadProfile()` 返回结构向后兼容旧数据（缺字段用默认值填充）。
5. 中英文文案完整。
