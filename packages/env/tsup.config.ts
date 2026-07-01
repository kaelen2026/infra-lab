import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/core.ts", "src/feishu.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  external: ["zod"],
});
