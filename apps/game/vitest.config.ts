import { defineConfig } from "vitest/config";

// 引擎(cards/combos/game/ai)是纯 TS,不碰 DOM,天然 hermetic —— 与仓库其它包一致。
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
  },
});
