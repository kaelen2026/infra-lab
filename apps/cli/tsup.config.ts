import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: false,
  clean: true,
  sourcemap: true,
  // Emitted binary is invoked directly (`infra-lab …`), so prepend a shebang. The
  // `bin` field in package.json points at this bundled dist/index.js.
  banner: { js: "#!/usr/bin/env node" },
});
