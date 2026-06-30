import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/contracts/auth.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
});
