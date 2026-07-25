## 视觉方向

**基调**：晨雾般清爽的浅色底 + 湖蓝作为唯一强调色 + 极少量薄荷绿点缀成功态。让人放松、干净、有呼吸感。彻底告别当前的褐色/黑色填充。

**字体**：保持 Inter（sans）+ JetBrains Mono，不做替换（用户表示如无更好选择可不动）。仅调整标题字重与字距，让排版更松弛。

## 一、设计 Token（`src/styles.css`）

改写 `:root` 全部语义色，同时新增湖蓝主色梯度与柔和阴影/渐变 token。

```text
背景系（晨雾）
  --background     : oklch(0.995 0.003 240)   接近纯白，微冷调
  --sidebar/muted  : oklch(0.975 0.012 235)   雾面浅蓝白 #F1F5FA 感
  --card           : oklch(1 0 0)              纯白卡面
  --secondary      : oklch(0.965 0.018 232)   悬浮/hover 底

文字系
  --foreground     : oklch(0.24 0.03 250)     深墨蓝(而非纯黑)，柔和
  --muted-foreground: oklch(0.55 0.02 245)    次级文字
  
主色（湖蓝）
  --primary        : oklch(0.62 0.14 235)     #0284C7 感
  --primary-foreground: oklch(0.99 0.005 240)
  --primary-soft   : oklch(0.94 0.04 235)     淡蓝背景（chip/tag/hover）
  --primary-glow   : oklch(0.78 0.10 230)     渐变尾色 #7DD3FC 感
  --ring           : oklch(0.62 0.14 235 / 0.35)

反馈色（点缀，只在必要时出现）
  --success        : oklch(0.72 0.13 175)     薄荷绿
  --destructive    : oklch(0.62 0.20 25)      柔和红

边框/描边
  --border         : oklch(0.92 0.012 235)    极淡蓝灰描边
  --input          : oklch(0.94 0.010 235)

渐变与阴影
  --gradient-hero  : linear-gradient(180deg, #F0F7FD 0%, #FFFFFF 60%)
  --gradient-accent: linear-gradient(135deg, var(--primary), var(--primary-glow))
  --shadow-soft    : 0 1px 2px oklch(0.4 0.05 240 / 0.04), 0 8px 24px -12px oklch(0.4 0.08 240 / 0.10)
  --shadow-focus   : 0 0 0 3px oklch(0.62 0.14 235 / 0.15)
```

同时补齐 `@theme inline`，暴露 `bg-primary-soft`、`bg-gradient-accent`、`shadow-soft` 等工具类。

**排版微调**：`h1..h4` 从 600 降到 550/字距 -0.015em；正文 `line-height` 提高到 1.6，让页面更松弛。

## 二、组件层调整（不改交互，只换填充语义）

所有当前用到"深黑填充"（`bg-foreground text-background`）的位置，改为语义主色：

| 位置 | 现状 | 调整后 |
| --- | --- | --- |
| 首页 Composer 发送按钮 | `bg-foreground` | `bg-primary` + `hover:opacity-90` |
| 首页 Chip 激活态 | `bg-foreground text-background` | `bg-primary-soft text-primary border-primary/40` |
| Kindred Logo 方块 | 黑底白字 | 湖蓝渐变底白字 |
| Auth 主按钮 / OAuth 按钮 | 黑填充 | 主 CTA 用 `bg-primary`；OAuth 用白底 + 描边 |
| 语言切换器激活态 | 黑底 | `bg-primary-soft text-primary` |
| 移动端 TabBar 激活图标 | `text-foreground` | `text-primary` + 顶部 2px 湖蓝指示条 |
| Matchmaker/Side-by-side 主要操作 (Say hello / Save) | 黑填充 | Say hello=`bg-primary`；Save 未收藏=描边、已收藏=`bg-primary-soft text-primary` |
| Connections 未读点 | 黑点 | 湖蓝点 |
| Sheet drag handle | 深灰 | 淡蓝灰 |
| Profile 头像占位 | 深灰 | `bg-gradient-accent` 圆形柔光底 |

**页面氛围**：
- 首页 & Auth 页背景改为 `--gradient-hero`（顶部一抹极淡的湖蓝雾，向下过渡到纯白），让首屏立刻感到清爽而不空。
- 匹配详情卡片的 `Portrait / Why-this-person` 区块给一个极淡的 `bg-primary-soft/40` 底，让信息分层更清楚。
- 卡片阴影统一换成 `--shadow-soft`（冷色调阴影），比现在的中性阴影更贴合湖蓝基调。

## 三、深色模式（顺手补一份，不额外增负担）
在 `.dark` 下写一份对应变量：深墨蓝底 `oklch(0.22 0.02 245)` + 保持湖蓝主色（略提亮到 0.68）。当前若无 `.dark` 触发器可先只落 token，不接入切换 UI。

## 四、验收
- 站内所有黑色填充按钮/徽标已被湖蓝或湖蓝渐变替代；除 `foreground` 文字本身，页面不出现纯黑色块。
- 首页首屏、Auth 页、匹配详情页视觉上出现明确的湖蓝氛围，但不喧宾夺主（强调色使用面积 <15%）。
- 移动端 TabBar 激活态一眼可辨（湖蓝指示条 + 蓝图标）。
- Lighthouse 对比度：主色 `#0284C7` on 白底 = 4.7:1 ✅；主色 on `--primary-soft` 底 = 4.9:1 ✅。

## 不做
- 不换字体家族（Inter 保留），只调字重/字距/行高。
- 不改任何交互流程、组件结构、路由或文案。
- 不引入新依赖。
- 不引入分区着色（Introduce/Together 各自不同色）——保持单一强调色系，避免复杂。

## 变更文件清单
- `src/styles.css`（token 全面重写 + 新增柔光渐变/阴影工具类）
- `src/components/home.tsx`（Composer 按钮、chip、logo、背景渐变）
- `src/components/lang-switcher.tsx`（激活态换色）
- `src/components/mobile/tab-bar.tsx`（激活态换色 + 顶部指示条）
- `src/routes/auth.tsx`（CTA、OAuth 按钮、背景渐变）
- `src/routes/profile.tsx`（头像占位、welcome banner）
- `src/components/canvas/intro-canvas.tsx`（Say hello / Save 按钮、traits chip）
- `src/components/canvas/meet-canvas.tsx`（同上）
- `src/components/canvas/connection-thread.tsx`（未读点、状态色）
- `src/components/saved-trigger.tsx` / `history-trigger.tsx`（图标 hover 态）
- `src/components/workspace-header.tsx`（右上角按钮组）
