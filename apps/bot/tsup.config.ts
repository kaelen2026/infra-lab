import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: false,
  clean: true,
  sourcemap: true,
  // responder 在运行时用 readFileSync(new URL("./prompt.md", import.meta.url)) 读系统
  // 提示词。bundle 后 import.meta.url 指向 dist/index.js，把 prompt.md 复制到 dist 根下，
  // 让 `node dist/index.js` 也能读到（dev 走 tsx 直接读 src 旁的原文件，无需复制）。
  onSuccess: "cp src/feishu/responder/prompt.md dist/prompt.md",
});
