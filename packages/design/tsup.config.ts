import { defineConfig } from "tsup";

export default defineConfig({
  // Only the library entry ships to dist; `generate.ts` is a script run via tsx.
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
});
