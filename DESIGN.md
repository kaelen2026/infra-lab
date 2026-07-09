# infra-lab · DESIGN.md(跨端设计系统)

一句话方向:**暖纸编辑感 + 暖调明暗双主题(暗色优先)+ 黏土色单强调**。像一份被认真排版过的
纸面文档,不是又一块 SaaS 仪表盘;刻意避开满屏 AI 蓝紫渐变。

本文档是**跨端**设计语言的事实源说明,面向 web / h5 / ios / android / harmony /
miniprogram 六个客户端。所有颜色与形状 token 的机器事实源是
[`packages/design/src/tokens.ts`](packages/design/src/tokens.ts),用户可见文案的事实源是
[`packages/design/src/copy.ts`](packages/design/src/copy.ts);各端产物由
`pnpm gen:design` 生成,**任何 `*.generated.*` 文件禁止手改**(CI 有 drift gate)。
web 端页面级细节(登录页、仪表盘、导航)另见 [`apps/web/DESIGN.md`](apps/web/DESIGN.md)。

## 1. 视觉主题与氛围

- **纸感**:画布是奶油纸(light)或暖炭黑(dark),中性色全部朝暖色相(hue 60〜90)微偏,
  chroma 0.006〜0.012,潜意识里整屏协调。默认 dark。
- **编辑感排版**:衬线大标题带文学气,正文 grotesque 利落,数据(手机号、token、时间)一律等宽。
  层级靠留白与字体,不靠投影堆砌。
- **单强调**:黏土/赭一族是唯一强调色,60-30-10 里只占 10。错误红也偏暖。
- 密度中等偏松;交互克制(按压缩放、短过渡),不做装饰性动效。

## 2. 调色板与角色

OKLCH 为权威格式(web/h5 直接消费);native 端消费由 `oklchToHex` 转换的 sRGB hex。
下表即 `tokens.ts` 全量语义角色(hex 为生成器实际输出):

| 角色 | light | dark | 用途 |
| --- | --- | --- | --- |
| background | `oklch(0.985 0.008 90)` `#FCFAF4` | `oklch(0.18 0.006 70)` `#13110F` | 页面画布(奶油纸 / 暖炭黑) |
| foreground | `oklch(0.26 0.012 60)` `#29231E` | `oklch(0.93 0.006 80)` `#EAE7E3` | 主文字(暖墨 / 暖白) |
| card | `oklch(0.998 0.004 90)` `#FFFEFB` | `oklch(0.215 0.007 70)` `#1C1916` | 抬升表面 |
| popover | `oklch(1 0 0)` `#FFFFFF` | 同 card | 浮层 |
| primary | `oklch(0.56 0.15 45)` `#B95115` | `oklch(0.70 0.13 48)` `#DF8352` | 黏土强调:主按钮、焦点环、品牌 |
| primaryDeep | `oklch(0.44 0.16 42)` `#952400` | `oklch(0.56 0.15 45)` `#B95115` | 按压/渐变深位(**仅 native**,web 无此 CSS 变量) |
| primary-foreground | `oklch(0.99 0.005 90)` `#FDFCF8` | `oklch(0.20 0.02 50)` `#1E130E` | 强调面上的文字 |
| secondary / muted | `oklch(0.95 0.008 85)` `#F1EEE9` | `oklch(0.27 0.008 70)` `#292622` | 次级填充、静默背景 |
| muted-foreground | `oklch(0.52 0.012 60)` `#6E6762` | `oklch(0.71 0.01 75)` `#A5A19B` | 次要文字 |
| accent | `oklch(0.93 0.012 70)` `#EDE7DF` | `oklch(0.30 0.012 60)` `#322C28` | hover/选中底 |
| destructive | `oklch(0.55 0.18 27)` `#C53732` | `oklch(0.58 0.16 25)` `#C74B47` | 错误、退出登录红字 |
| border / input | `oklch(0.90 0.008 85)` `#E0DED8` | `oklch(0.30 0.008 70)` `#302D2A` | 分隔线、描边 |
| ring | 同 primary | 同 primary | focus 焦点环 |

**各端 token 落点**(名字不同,值同源;完整发射逻辑见 `packages/design/src/generate.ts`):

| 语义角色 | web/h5 CSS 变量 | iOS `DesignTokens` | Android `DesignTokens` | Harmony `$r('app.color.*')` |
| --- | --- | --- | --- | --- |
| background | `--background` | `background` | `background` | `page_background` |
| card | `--card` | `surface` | `surface` | `surface` |
| foreground | `--foreground` | `textPrimary` | `onSurface` | `text_primary` |
| muted-foreground | `--muted-foreground` | `textSecondary` | `onSurfaceVariant` | `text_secondary` |
| primary | `--primary` | `primary` | `primary` | `brand` |
| primaryDeep | (无) | `primaryDeep` | `primaryDeep` | (未发射) |
| destructive | `--destructive` | `danger` | `danger` | `danger` |
| border | `--border` | `border` | `outline` | `border` |

## 3. 排版规则

| 角色 | web / h5 | native(ios / android / harmony / miniprogram) | 用途 |
| --- | --- | --- | --- |
| display | **Spectral** → `Songti SC`/`Noto Serif SC` | 系统字体加重(SF Pro / Roboto / HarmonyOS Sans) | h1/h2、品牌名 |
| sans | **Hanken Grotesk** → `PingFang SC`/`Noto Sans SC` | 系统默认 | 正文、标签、按钮、导航 |
| mono | **JetBrains Mono** | 系统等宽(SF Mono / Roboto Mono 等) | 手机号、token、时间戳、IP、验证码 |

- native 端不引第三方字体(包体与授权),但**层级同构**:大标题重、正文常规、数据必须等宽。
- 数字一律 tabular(web `tabular-nums`;iOS `.monospacedDigit()`;Compose `FontFeature`)。
- CJK 正文行高 ≥1.7;拉丁 display 负字距(约 -0.018em)只作用于拉丁文,**绝不作用于 CJK**。
- web 禁用 Inter/Playfair/Fraunces 当 display(reflex 黑名单)。

## 4. 组件样式(跨端词汇)

- **主按钮**:黏土实底(`primary` 上放 `primary-foreground`),圆角 10px,按压态缩放约 0.98
  或换 `primaryDeep`;禁用 50% 不透明度。次按钮描边,ghost 透明。
- **输入框**:高 44px(web)/ 平台标准高(native),`background` 底 + 1px `border`,
  focus 用 `ring` 双环。验证码输入:等宽、居中、`0.4em` 字距、tabular。
- **卡片**:`card` 底;dark 用 1px `border` + 明度台阶,light 用微阴影
  (`0 1px 2px rgba(0,0,0,.05)`),相邻表面明度差 ≥4%,不允许隐形白卡。
- **导航**:web 贴顶半透明 + backdrop-blur + 底部 1px border;native 用平台原生导航结构,
  色值取自 token。
- **头像**:无图用 monogram 字标(名字/手机号末位),暖底。
- **文案**:全部从 `copy.ts`(或其生成产物 `AuthCopy.swift` / `AuthCopyGenerated.kt` /
  `copy.generated.ets`)取,**不得在客户端改写措辞**。语气:简体中文短句,全角标点,
  `{name}` 占位符由客户端运行时插值。错误提示映射稳定错误码(`ERROR_MESSAGES`),
  网络/未知一律收敛到通用文案。

## 5. 布局原则

- 间距走 4px 阶梯(4/8/16/24/32);**外层容器 padding = 内层元素 gap**。
- 认证类页面:单列居中卡片,内容宽上限约 400px。列表/仪表盘:主区 `max-w-3xl` 级,
  正文行宽约 65ch。
- 区块底部留白比顶部大约 20%,阅读重心自然下沉。

## 6. 深度与抬升

- **dark(默认)**:投影几乎不可见,抬升靠暖中性**明度台阶**(card 比 background 高约 3.5%)
  加 1px `border` 细线。
- **light**:白卡 + 微阴影,纸面柔和;不堆多层投影。
- 圆角刻度:`{6px, 10px(默认,`shape.radiusPx`), 14px, pill}`。按钮 10px,卡片 14px。

## 7. Do's / Don'ts(本项目专属)

- DO 新界面颜色一律从 `@infra/design` 落点取;发现某端缺角色,**先补 `tokens.ts` + 发射器**,
  再消费,绝不就地 hand-pick。
- DO 手机号 / token / 时间戳 / 验证码一律等宽 + tabular。
- DO 文案改动只改 `copy.ts` 后 `pnpm gen:design`;跨端措辞必须逐字一致(含全角标点)。
- DO 默认暗色主题;暗色下用 `foreground`,不用纯 `#fff`。
- DO 空态给有意义的文案(如"还没有原生设备登录"),不画假数据。
- DON'T 手改任何 `*.generated.*` / `tokens.generated.css` / `color.json`(CI drift gate 直接挂)。
- DON'T 引入第二个强调色家族;蓝紫渐变是本项目的反面清单
  (miniprogram 现存 `#0b6cff` 是历史欠账,见 §8,不要模仿扩散)。
- DON'T 居中 hero + 双 CTA + 三张同款卡片的 AI 套路。
- DON'T 在任何界面、日志、错误提示里回显手机号明文之外多余的敏感数据(admin 边界脱敏)。
- DON'T 任何输出用英文破折号。

## 8. 响应式与平台适配

- web/h5 断点 768px:导航收进头像下拉,卡片网格 1 列 → 2 列。交付前在 375 / 768 / 1280
  各验证一次,重点查中文串与长手机号(`+8613800138000`)溢出。
- 触控目标下限:web ≥40px,iOS ≥44pt,Android ≥48dp,Harmony 遵 ArkUI 默认。
- 明暗切换:web/h5 用 `.dark` class(next-themes);iOS trait collection;Android
  values-night;Harmony base/dark 资源目录。各端切换必须同时翻转全部语义角色,禁止半套。
- **已知欠账**:`apps/miniprogram` 尚未接入 `@infra/design`(自带 `#0b6cff` 蓝 + 冷灰,
  `generate.ts` 无 weapp 发射器)。收敛路径:为 wxss 增加发射器(CSS 变量 + rpx 适配),
  替换 `app.wxss` 手写色板。在此之前,小程序新页面颜色请直接抄本文档 §2 的 hex 值。
- `apps/cli` 是终端 UI,不消费色板;但提示文案语气与 §4 文案规范保持一致。

## 9. Agent Prompt 指南

快速色参照(dark 为默认主题):

```
bg=#13110F  fg=#EAE7E3  card=#1C1916  primary=#DF8352  primaryDeep=#B95115
muted-fg=#A5A19B  border=#302D2A  destructive=#C74B47  radius=10px
(web/h5 用 CSS 变量名,不用裸 hex:bg-background / text-foreground / bg-primary …)
```

改设计的唯一正确姿势:

```
改色/形状 → packages/design/src/tokens.ts
改文案   → packages/design/src/copy.ts
然后     → pnpm gen:design(重新生成全部端产物并提交)
```

可直接粘贴的示例 prompt:

- "登录卡(web):`bg-card` 14px 圆角,h1 serif 28px 字距 -0.012em 颜色 `foreground`,
  副文 `muted-foreground` 14px,手机号 Input 高 44px mono,主按钮黏土实底 10px 圆角
  `active:scale-[0.98]`,focus 用 `ring` 双环。"
- "会话列表行(任意端):标题 sans 15px 600,键值行左 `muted-foreground` 右 mono
  `foreground` tabular,行高固定避免状态切换抖动。"
- "iOS 主按钮:`DesignTokens.primary` 实底,文字 `DesignTokens.primaryForeground`,
  圆角 `DesignTokens.radius`,按压换 `DesignTokens.primaryDeep`,高 44pt。"
- "Compose 错误提示:`DesignTokens.Dark.danger` 文字 13sp,常规字重,置于输入框下方
  固定高度槽位,出现/消失不改变布局高度。"
- "Harmony 页面:背景 `$r('app.color.page_background')`,卡片 `$r('app.color.surface')`
  + 1px `$r('app.color.border')`,标题 `$r('app.color.text_primary')` 20fp 加重。"
