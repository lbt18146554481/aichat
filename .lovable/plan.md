## 方向

参考 Gemini / ChatGPT 的高级感：**纯白/近白为主色**，几乎无强调色出现在大面积填充上；蓝色只作为**图标、链接、聚焦环、极少数关键 CTA** 的点缀。所有"色块填充"回归中性灰阶。字体不动。

## 一、Token 重写（`src/styles.css`）

彻底移除现在的湖蓝渐变底 / primary-soft 蓝色卡面 / 冷调阴影。改为 ChatGPT/Gemini 式的中性系统：

```text
底层
  --background        : #FFFFFF                  纯白
  --surface           : #F7F7F8                  次级面（侧边栏/Sheet 底/hover）
  --card              : #FFFFFF
  --border            : #E5E5E7                  1px 极淡中性灰
  --input             : #F4F4F5

文字
  --foreground        : #0D0D0D                  近黑（非纯黑）
  --muted-foreground  : #6B6B70                  次级文字
  --subtle-foreground : #9A9AA0                  三级/占位

强调蓝（更精致：偏冷、偏克制，接近 Gemini 的 #1A73E8 / ChatGPT link #2F6FEB 之间）
  --primary           : #2F6FEB                  仅用于图标/链接/焦点/关键 CTA
  --primary-foreground: #FFFFFF
  --primary-hover     : #2A62D1
  --ring              : rgb(47 111 235 / 0.28)   聚焦环

反馈
  --success           : #16A34A                  仅状态点
  --destructive       : #DC2626

阴影（极淡中性，不带蓝）
  --shadow-sm         : 0 1px 2px rgb(0 0 0 / 0.04)
  --shadow-md         : 0 1px 2px rgb(0 0 0 / 0.04), 0 8px 24px -12px rgb(0 0 0 / 0.10)
```

**删除**：`--gradient-hero`、`--gradient-accent`、`--primary-soft`、`--primary-glow`、`bg-gradient-hero`、`bg-gradient-accent` 工具类及所有使用点。不再有页面级渐变底。

排版 / 字重 / 字体家族保持不变（Inter + JetBrains Mono，用户明确要求不动）。

## 二、组件层：把蓝底色块全部退出去

| 位置 | 现状 | 调整后 |
| --- | --- | --- |
| 首页背景 | `bg-gradient-hero`（蓝雾渐变） | 纯白 `bg-background` |
| Auth 页背景 | 蓝渐变 | 纯白 |
| Logo 方块 K | `bg-primary` 蓝底 | `bg-foreground text-background`（近黑方块）——ChatGPT/Gemini logo 也是中性 |
| 首页发送按钮 | `bg-primary` 蓝圆 | `bg-foreground text-background` 圆按钮；disabled 时 `bg-input text-subtle-foreground` |
| 首页 Chip 激活态 | `bg-primary-soft text-primary` | `bg-surface text-foreground border-foreground/20`（中性描边被选态） |
| 语言切换器激活态 | 蓝色软底 | `bg-surface text-foreground` |
| TabBar 激活图标 + 指示条 | 湖蓝 | 图标 `text-foreground`；指示条 2px `bg-foreground` 或删除指示条只保留字重加粗 |
| Say hello / 主 CTA（intro/meet canvas） | 蓝底 | `bg-foreground text-background`；hover `opacity-90` |
| Save 已收藏态 | `bg-primary-soft` | `bg-surface border-foreground/25 text-foreground` |
| 未读点 / 状态点 | 蓝点 | 保留蓝点（`--primary`）——这是"蓝色只用于点缀"允许的场景 |
| Portrait / Why-this-person 区块底 | `bg-primary-soft/40` | `bg-surface`（中性灰） |

**蓝色允许出现的位置**（唯二）：
1. 图标本身（`text-primary`）：如未读小圆点、链接图标、可点击的强调提示。
2. 聚焦环（`ring-primary`）与文字型链接（`text-primary hover:underline`）。

其余所有位置严禁出现蓝色填充。

## 三、Web 版比例重建

用户指出 web 版比例乱了。参考 Gemini 首页节奏：

- **顶栏**：高度 56px（`h-14`），横向左右 `px-6`，只放 Logo（左）+ 极简操作组（右）。当前 `py-5` 过大，改为 `h-14 items-center`。
- **主区容器**：`max-w-3xl mx-auto`（而非当前 `max-w-2xl`），首屏内容整体上移到视口约 40% 处而非死居中——通过 `pt-[18vh]` 顶部推入而非 `justify-center`。
- **问候语**：`text-[40px] md:text-[44px] leading-[1.15] font-normal tracking-[-0.02em]`（Gemini/ChatGPT 首屏问候都是大字号、常规字重、紧字距），去掉 `italic` 与 serif 假设（保持 Inter）。
- **Composer**：宽度跟随 `max-w-3xl`；圆角从 `rounded-2xl` 提升到 `rounded-3xl`；内边距 `px-5 py-4`；只保留 1px `border-border`，不叠双层阴影，仅 `shadow-sm`；focus-within 边框改为 `border-foreground/30`（不再是蓝）。
- **Chip 排布**：Chip 从"发送按钮同一行"移到 composer 上方，作为建议芯片行（`gap-2 mb-3`）—Gemini/ChatGPT 都是这种结构。发送按钮内嵌 composer 右下角，圆形 36px。
- **底部脚注**：字号从 11px 降至 11px 但颜色 `text-subtle-foreground`，位置紧贴 composer 下 `mt-3`，居中。
- **移动端**：不动结构，只跟随 token 变更；TabBar 底色 `bg-background/80 backdrop-blur` + 顶部 `border-t`。

## 四、验收

- 全站不出现蓝色**填充**（背景、按钮底、卡片底、chip 底）。蓝只出现在：图标、链接文字、聚焦环、未读点。
- 主 CTA 一律近黑填充（`#0D0D0D`），与 ChatGPT/Gemini 一致。
- 首页无渐变背景；页面呼吸感来自留白与字距，而非色彩。
- Web 版首屏顶栏 56px、内容 `max-w-3xl`、问候大字、Composer 圆角 `3xl`、Chip 位于 composer 上方。
- 移动端 TabBar 与 Composer 未破坏，颜色跟随更新。

## 不做

- 不改字体家族、不改文案、不改路由、不改任何业务逻辑与组件结构。
- 不再引入渐变、彩色阴影、多强调色。
- 不改深色模式的存在性（只把 `.dark` 里对应变量按同规则替换为中性深灰 + 同一支蓝）。

## 变更文件清单

- `src/styles.css`（token 全面重写，删除渐变/软蓝工具类，新增中性 shadow）
- `src/components/home.tsx`（顶栏高度、容器宽度、问候字号、Composer 结构、按钮/Chip 颜色）
- `src/routes/auth.tsx`（去渐变底、CTA 换近黑）
- `src/components/lang-switcher.tsx`（激活态换中性）
- `src/components/mobile/tab-bar.tsx`（激活态换中性 + 顶部指示条改中性或移除）
- `src/components/canvas/intro-canvas.tsx` / `meet-canvas.tsx`（Say hello / Save 按钮换近黑、Portrait 区块底换中性）
- `src/components/canvas/connection-thread.tsx`（未读点保持蓝，其他填充退回中性）
- `src/components/saved-trigger.tsx` / `history-trigger.tsx` / `workspace-header.tsx`（hover/激活态跟随）
- `src/routes/profile.tsx`（头像占位、welcome banner 去渐变）
