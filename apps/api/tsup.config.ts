import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server.ts"],
  format: ["esm"],
  dts: false,
  clean: true,
  sourcemap: true,
  // Workspace deps + node_modules are resolved at runtime, not bundled.
  external: ["@infra/auth", "@infra/db", "@infra/redis", "@infra/shared"],
});
