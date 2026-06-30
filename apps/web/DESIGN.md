# infra-lab web · DESIGN.md

整体视觉规划。锁定方向：**暖纸感排版骨架 + 暖调明暗双主题（暗色优先）+ 黏土色单强调**。
覆盖三块：登录页 `/auth`、受保护首页 `/`（账户与会话仪表盘）、跨页导航。

## 1. 视觉主题与氛围

像一份编辑过的纸面文档，而非一块 SaaS 仪表盘。衬线大标题带文学气，正文 grotesque 利落，
数据（手机号、Token、时间）落到等宽。默认暖炭黑（不是冷 zinc），可一键切到暖白纸。
强调色用黏土/赭，刻意避开满屏 AI 蓝紫。密度中等偏松，靠留白和字体分层级，不靠投影堆砌。

## 2. 调色板与角色（OKLCH，dark 为默认）

| token | dark | light | 角色 |
| --- | --- | --- | --- |
| background | `oklch(0.18 0.006 70)` | `oklch(0.985 0.008 90)` | 页面画布（暖炭黑 / 奶油纸） |
| foreground | `oklch(0.93 0.006 80)` | `oklch(0.26 0.012 60)` | 主文字（暖白 / 暖墨） |
| card | `oklch(0.215 0.007 70)` | `oklch(0.998 0.004 90)` | 抬升表面 |
| muted-foreground | `oklch(0.71 0.01 75)` | `oklch(0.52 0.012 60)` | 次要文字 |
| primary | `oklch(0.70 0.13 48)` | `oklch(0.56 0.15 45)` | 黏土强调（主按钮 / 焦点环） |
| primary-foreground | `oklch(0.20 0.02 50)` | `oklch(0.99 0.005 90)` | 强调上的文字 |
| border / input | `oklch(0.30 0.008 70)` | `oklch(0.90 0.008 85)` | 分隔线、描边 |
| destructive | `oklch(0.58 0.16 25)` | `oklch(0.55 0.18 27)` | 错误态 |

中性色全部朝暖色相（hue 60-90）微偏，chroma 0.006-0.012：潜意识协调。强调色只有黏土一族，60-30-10 里占 10。

## 3. 排版规则

| 角色 | 字体 | 用途 | 字距 |
| --- | --- | --- | --- |
| display/serif | **Spectral**（Production Type）→ `Songti SC`/`Noto Serif SC` fallback | h1/h2、品牌名 | 32px+ 约 -0.018em |
| sans | **Hanken Grotesk** → `PingFang SC`/`Noto Sans SC` | 正文、标签、按钮、导航 | 正常 |
| mono | **JetBrains Mono** | 手机号、Token、时间戳、IP | 正常 |

非 Inter/Playfair/Fraunces 系（reflex 黑名单）。CJK 段 `lang="zh"`，行高 1.7；拉丁负字距只 scope 到 `lang="en"`。
数字一律 `tabular-nums`。标题 `text-wrap: balance`，正文 `pretty`。

## 4. 组件样式（shadcn/ui，Tailwind v4 + CSS 变量）

- **Button**：`--radius` 10px。primary=黏土实底；secondary=描边；ghost=透明。全态 `active:scale-[0.98]`，
  `transition-[transform,background-color]`，禁用 `opacity-50`。focus-visible 黏土环。
- **Input**：高 44px，`bg-background` + 1px `border-input`，focus 时 `ring-2 ring-ring`。验证码输入 `tracking-[0.4em] text-center tabular-nums`。
- **Card**：`bg-card`，dark 用 1px `border` + 极淡阴影，light 用 `shadow-sm`（相邻表面 ≥4% 明度差，不靠隐形白卡）。
- **导航**：贴顶，`backdrop-blur` + 半透明 `bg-background/80`，底部 1px border。右侧头像下拉（用户名 + mono 手机号 + 退出）+ 主题切换。
- **Avatar**：无图时 monogram 字标（取名字/手机号末位），暖底。

## 5. 布局原则

间距走 4px 阶梯（gap-2/4/6/8）。外层容器 padding = 内层 gap。
登录页：单列居中卡片 `max-w-[400px]`。仪表盘：导航 + `max-w-3xl` 主区，卡片网格 1 列（移动）→ 2 列（≥768px）。
正文宽约 65ch。区块底 padding 比顶大约 20%。

## 6. 深度与抬升

dark：画布近黑，抬升靠暖中性的明度台阶（card 比 bg 高约 3.5%），border `0.30` 细线。传统投影在暗面几乎不可见，不依赖。
light：白卡 + `shadow-sm`（`0 1px 2px rgba(0,0,0,.05)`），纸面柔和。
圆角刻度：`{6px, 10px(默认), 14px, pill}`，按钮统一 10px，卡片 14px。

## 7. Do's / Don'ts（本项目）

- DO 手机号/Token/时间一律 mono + tabular。
- DO 登录成功 → 直接 `router.push("/")`，不停留成功页。
- DO 设备列表空时给有意义的空态（"还没有原生设备登录"），不画假数据。
- DON'T 用 Inter/Playfair 当 display。
- DON'T 暗色下用纯 `#fff` 文字（用 `foreground` token）。
- DON'T 居中 hero + 双 CTA + 三张相同卡的 AI 套路。
- DON'T 任何输出用英文破折号。

## 8. 响应式行为

断点 768px。导航在窄屏收成头像下拉（品牌名留、链接进菜单）。
仪表盘卡片网格 1→2 列。触控目标 ≥40px。在 375 / 768 / 1280 各验证一次，查中文与长手机号溢出。

## 9. Agent Prompt 指南

快速色参照（dark）：`bg=oklch(0.18 0.006 70)` `fg=oklch(0.93 0.006 80)` `card=oklch(0.215 0.007 70)`
`primary=oklch(0.70 0.13 48)` `border=oklch(0.30 0.008 70)` `muted-fg=oklch(0.71 0.01 75)`。

示例组件 prompt：

- "登录卡：`bg-card` 14px 圆角，h1 用 serif 28px 字距 -0.012em 颜色 `foreground`，副文 `muted-foreground` 14px，
  手机号 Input 高 44px mono，主按钮黏土实底 10px 圆角 `active:scale-[0.98]`。"
- "顶部导航：贴顶 `bg-background/80 backdrop-blur` 底部 1px `border`，左品牌名 serif，右 Avatar monogram +
  DropdownMenu（用户名 sans、手机号 mono `muted-foreground`、分隔线、退出登录红字）+ 主题切换图标按钮。"
- "会话卡：标题 sans 15px 600，键值行左 `muted-foreground` 右 mono `foreground` tabular，行高固定避免抖动。"
