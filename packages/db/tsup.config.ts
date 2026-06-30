import { defineConfig } from "tsup";

export default defineConfig({
  // Object form pins output paths (dist/index.js, dist/schema/auth.js) regardless
  // of where the sources live, since `schema/` sits outside `src/`.
  entry: {
    index: "src/index.ts",
    "schema/auth": "schema/auth.ts",
  },
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  external: ["drizzle-orm", "postgres"],
});
