
## 判断

你说得对。当前主卡把两条原话（"你说 X"、"TA 说 Y"）整个搬进 Sheet 了，主卡只剩一行结构化 tag（`🎾 网球 · 周六早上 · 中级`）。问题是：

- 结构化 tag 是系统解析的结果，缺少"人味"。看到 "TA 说：想找个搭子长期打" 才有那种"哦，池子里真的有人在想这件事"的实感。
- 现在要点开 Sheet 才能看到，等于把关键说服信息藏了一层。
- 这跟"简洁"不矛盾——那两条引号本身就短，不占几行。

**结论**：把双方原话作为一个轻量摘要恢复到主卡上，跟结构化 tag 一起承担"事"的说明；Sheet 里同样的内容作为详情备份保留。

## 主卡摘要长什么样

不做回原来那两张并排 `IntentCard`（太重、有头像/标签栏）。改成**紧凑双行引号**：

```text
┌──────────────────────────────┐
│ [头像]  June, 28              │
│        上海 · 独立设计师   › 更多 │
├──────────────────────────────┤
│ ✦ 为什么是 TA                    │
│ TA 也安静、爱读书……              │
├──────────────────────────────┤
│ 为什么对上 · 你们都想 🎾 网球 · 周六早上 │   ← 现有 aligned 行
│                                │
│  ┌─ 你说 ────────────┐         │   ← 新增：紧凑双行
│  │ "想找人打网球"       │         │
│  └───────────────────┘         │
│  ┌─ TA 说 ───────────┐         │
│  │ "想找搭子长期打"     │         │
│  └───────────────────┘         │
├──────────────────────────────┤
│ [   开始聊 TA   ]  [看下一个]      │
└──────────────────────────────┘
```

排版细节：
- 每条一行：极小的 uppercase 标签（`你说 / TA 说`）+ 一行引号原话。文本超长时截断 `line-clamp-2`。
- 两行卡竖排（不并排）——竖排在窄容器下更稳，视觉重量小于原来的两张 IntentCard，也不抢主 CTA。
- 底色沿用 `bg-secondary/40` 或 `border-border bg-card`，比 Sheet 里的引号更 subtle。
- 不显示 tag pill 组（`🎾 网球` `周六 早上`）——这些已经在 aligned 行里说了，主卡不重复。

放置位置：**紧接在 aligned 行下方**（`intent.aligned_body` 之后、CTA 之前）。理由：
1. "为什么对上" 先给系统总结，紧跟其后是双方原话作为证据支撑，读起来是"因为 → 所以"的顺序。
2. 靠近 CTA，用户下决定前最后看到的就是"TA 真的说过这句话"，说服力最强。

## 改动

### `src/components/canvas/meet-canvas.tsx` — 只改 `MatchView`

在 aligned block（约 149-158 行）和按钮组之间插入紧凑引号摘要：

```tsx
{/* Their own words + yours — the human evidence backing the aligned tag. */}
<div className="mt-3 space-y-1.5">
  <QuoteLine label={t("intent.you_said")} text={lang === "zh-CN" ? mine.rawText_zh : mine.rawText} />
  <QuoteLine label={t("intent.they_said")} text={lang === "zh-CN" ? other.rawText_zh : other.rawText} />
</div>
```

新增本文件内部的 `QuoteLine`：

```tsx
function QuoteLine({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-secondary/40 px-3 py-2">
      <div className="text-[9.5px] uppercase tracking-[0.14em] font-mono text-muted-foreground">
        {label}
      </div>
      <p className="mt-0.5 text-[12.5px] text-foreground/90 leading-snug line-clamp-2">
        "{text}"
      </p>
    </div>
  );
}
```

Sheet 里的"你们要一起做的事"section 保留不变（作为详情备份，含 aligned tag）。

### 不做的事

- 不动身份行、WhyPersonBox、aligned 行、CTA、footnote、Sheet。
- 不加 tag pill、活动图标（避免和 aligned 行重复）。
- 不改 NoMatch / Chat / Empty / EditWishPanel。
- 不改 i18n（复用已有的 `intent.you_said` / `intent.they_said`）。

## 验收

1. 匹配卡从上到下：MATCH 头 → 身份行（可点开 Sheet）→ WhyPersonBox → aligned 行 → **两条紧凑引号（新）** → CTA → footnote。
2. 引号里显示的正是双方 intent 的原话（zh 或 en 跟随语言）。
3. 长文本被截到 2 行内，不撑破布局。
4. 主 CTA `[开始聊 TA]` 依然是最下方最粗的按钮，视觉重量仍最大。
5. 点身份行打开 Sheet，"你们要一起做的事" section 里还能看到同样两条引号 + aligned tag（作为详情备份）。
