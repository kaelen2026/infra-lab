import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/core.ts", "src/bot.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  external: ["zod"],
});
