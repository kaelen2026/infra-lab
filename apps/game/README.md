# @infra/game — 网页版 canvas 斗地主

浏览器里的**单机斗地主**:你(座位 0)对阵两名 AI(右家 / 左家)。叫地主、出牌、
炸弹、飞机、王炸一应俱全,免注册、免后端、全本地运行。

- **页面外壳**:React + Tailwind v4(状态栏、按钮、叫分 / 结算弹窗)。
- **棋盘渲染**:`<canvas>` 命令式绘制(牌桌绒面、三家面板、出牌堆、手牌),
  事件驱动重画,不做无谓的每帧循环。
- **规则引擎**:`src/engine/` 纯 TS,无 DOM 依赖,可被 vitest hermetic 单测。

与 `apps/{api,web,h5}` 无耦合:不依赖 auth / OTP / `@infra/*`,是一个自包含的静态站点。

## 开发

```bash
pnpm --filter @infra/game dev        # http://localhost:3005/game/
pnpm --filter @infra/game test       # 引擎单测(vitest)
pnpm --filter @infra/game typecheck
pnpm --filter @infra/game build      # 产物在 dist/
pnpm --filter @infra/game preview    # 预览 dist(:3005)
```

`vite.config.ts` 的 `base: "/game/"` 便于像 `apps/id-photo` 一样部署到 GitHub Pages 子路径。

## 目录

```
src/
  engine/            纯规则引擎(可单测,无 DOM)
    cards.ts         牌/点数编码、发牌、洗牌、排序
    combos.ts        牌型识别 identify() + 大小比较 beats()
    game.ts          状态机:发牌 / 叫地主 / 出牌 / 不出 / 清桌 / 结算(纯函数,返回新状态)
    ai.ts            合法出牌枚举 + 朴素策略(甩长链、留炸弹、队友不互压、残局补刀)
  game/
    controller.ts    可变对局 + 人类选牌;定时驱动 AI 回合;对外发布不可变快照
  render/
    layout.ts        人类手牌几何 + 命中测试(渲染与拾取共用)
    renderer.ts      canvas 绘制:绒面 / 面板 / 出牌堆 / 手牌
  ui/
    App.tsx          React 外壳:承载 canvas、指针拾取、Tailwind chrome
  main.tsx           挂载
test/                combos / game / ai 的 hermetic 单测
```

## 规则实现要点

- 牌力顺序 `3<4<…<A<2<小王<大王`,`rank` 整数编码;花色只影响显示。
- 牌型:单 / 对 / 三 / 三带一 / 三带二 / 顺子(≥5)/ 连对(≥3 对)/
  飞机(≥2 连三,可带单翼或双翼)/ 炸弹(四张)/ 王炸(双王)。
- 比较:炸弹压普通牌、大炸压小炸、王炸最大;其余须同型同长、主点更大。
- 叫地主:三家各叫一次(0=不叫,1~3 叫分),最高者当地主收 3 张底牌;都不叫则重发。
- 结算:地主赢 +2×倍数、两农民各 −倍数(反之亦然),零和;炸弹 / 王炸各翻倍。

引擎是纯函数 + 依赖注入(可注入确定性随机源),因此单测无需真实计时器或随机源。
